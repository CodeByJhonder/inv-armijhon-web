-- Repair VES credit entries whose USD principal was left null, then prevent
-- new local VES credit sales from creating the same inconsistency.
-- Run after local-sales-credit-ves-rate-migration.sql.

-- Recover VES sale principal from the persisted sale line totals.
update public.local_sale_credit_ledger entry
set amount_usd = round(sales.total_usd, 8)
from (
    select sale.batch_id, sum(sale.total_usd) as total_usd
    from public.local_sales sale
    where sale.currency = 'VES' and sale.batch_id is not null
    group by sale.batch_id
) sales
where entry.entry_type = 'sale'
  and entry.currency = 'VES'
  and entry.amount_usd is null
  and entry.sale_batch_id = sales.batch_id
  and sales.total_usd > 0;

-- If any old VES payment lacks its USD equivalent, derive it from the rate
-- already captured on that payment.
update public.local_sale_credit_ledger
set amount_usd = round(amount / exchange_rate, 8)
where entry_type = 'payment'
  and currency = 'VES'
  and amount_usd is null
  and exchange_rate is not null
  and exchange_rate > 0;

do $$
begin
    if exists (
        select 1 from public.local_sale_credit_ledger
        where currency = 'VES' and amount_usd is null
    ) then
        raise exception 'Hay movimientos VES sin base USD recuperable; revisa el historial antes de continuar.';
    end if;
end;
$$;

create or replace function public.admin_record_local_product_sales_on_credit(
    p_items jsonb,
    p_currency text,
    p_exchange_rate numeric,
    p_sold_on date,
    p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_currency text := upper(btrim(p_currency));
    saved_exchange_rate numeric(18, 6);
    target_customer public.local_sale_customers%rowtype;
    current_balance numeric(18, 8);
    displayed_balance numeric(18, 2);
    credit_limit numeric(14, 2);
    expected_charge numeric(14, 2);
    actual_charge numeric(14, 2);
    sale_usd numeric(18, 8);
    batch_value uuid;
    sale_result jsonb;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar ventas fiadas.' using errcode = '42501';
    end if;
    if p_customer_id is null then
        raise exception 'Selecciona el cliente de esta venta fiada.' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
        raise exception 'La venta debe tener entre 1 y 30 líneas válidas.' using errcode = '22023';
    end if;
    if clean_currency is null or clean_currency not in ('USD', 'VES', 'COP') then
        raise exception 'La moneda debe ser USD, VES o COP.' using errcode = '22023';
    end if;
    if p_sold_on is null or p_sold_on > current_date then
        raise exception 'La fecha de venta no puede estar vacía ni en el futuro.' using errcode = '22023';
    end if;
    if clean_currency = 'VES' then
        if p_exchange_rate is null or p_exchange_rate <= 0 or p_exchange_rate > 1000000000 then
            raise exception 'No hay una tasa USD/VES válida para esta venta.' using errcode = '22023';
        end if;
        saved_exchange_rate := round(p_exchange_rate, 6);
    end if;

    select * into target_customer
    from public.local_sale_customers
    where id = p_customer_id and is_active
    for update;
    if not found then
        raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0002';
    end if;

    select coalesce(sum(case
        when clean_currency = 'COP' then round(line.amount, 2)
        when clean_currency = 'USD' then round(round(line.amount, 2) * line.quantity, 2)
        else round(round(line.amount, 2) * line.quantity * saved_exchange_rate, 2)
    end), 0)
    into expected_charge
    from jsonb_to_recordset(p_items) as line(
        sale_type text, product_id text, service_id uuid, quantity integer, amount numeric
    );
    if expected_charge <= 0 then
        raise exception 'El total de la venta debe ser mayor que cero.' using errcode = '22023';
    end if;

    select coalesce(sum(case when entry.entry_type = 'sale' then
        case when clean_currency = 'VES' then entry.amount_usd else entry.amount end
        else -case when clean_currency = 'VES' then entry.amount_usd else entry.amount end
    end), 0)
    into current_balance
    from public.local_sale_credit_ledger entry
    where entry.customer_id = p_customer_id and entry.currency = clean_currency;

    displayed_balance := case when clean_currency = 'VES'
        then round(current_balance * saved_exchange_rate, 2)
        else round(current_balance, 2)
    end;
    credit_limit := case clean_currency
        when 'USD' then target_customer.credit_limit_usd
        when 'VES' then target_customer.credit_limit_ves
        else target_customer.credit_limit_cop
    end;
    if credit_limit <= 0 or displayed_balance + expected_charge > credit_limit then
        raise exception 'La venta supera el crédito disponible en %: saldo %, venta %, límite %.',
            clean_currency, displayed_balance, expected_charge, credit_limit
            using errcode = 'P0001';
    end if;

    sale_result := public.admin_record_local_product_sales(
        p_items, clean_currency, saved_exchange_rate, p_sold_on
    );
    batch_value := (sale_result ->> 'batch_id')::uuid;
    actual_charge := round((sale_result ->> 'total_amount')::numeric, 2);
    if clean_currency = 'VES' then
        -- The product-sales RPC response omits total_usd. Read the persisted
        -- line totals for this batch so the VES debt always gets a USD principal.
        select round(coalesce(sum(sale.total_usd), 0), 8)
        into sale_usd
        from public.local_sales sale
        where sale.batch_id = batch_value;
        if sale_usd is null or sale_usd <= 0 then
            raise exception 'No se pudo calcular la base en USD del fiado en bol?vares.'
                using errcode = '22023';
        end if;
    else
        sale_usd := null;
    end if;
    if actual_charge <> expected_charge then
        raise exception 'El total calculado no coincide; no se registró la venta.' using errcode = '22023';
    end if;

    update public.local_sales
    set customer_id = p_customer_id
    where batch_id = batch_value;

    insert into public.local_sale_credit_ledger (
        customer_id, entry_type, currency, amount, amount_usd, exchange_rate,
        sale_batch_id, sold_on, note, created_by
    ) values (
        p_customer_id, 'sale', clean_currency, actual_charge, sale_usd,
        case when clean_currency = 'VES' then saved_exchange_rate end,
        batch_value, p_sold_on, 'Venta local fiada', auth.uid()
    );

    return sale_result || jsonb_build_object(
        'is_credit', true,
        'customer_id', p_customer_id,
        'customer_name', target_customer.full_name,
        'credit_balance', displayed_balance + actual_charge,
        'credit_available', greatest(0, credit_limit - displayed_balance - actual_charge)
    );
end;
$$;
revoke all on function public.admin_record_local_product_sales_on_credit(jsonb, text, numeric, date, uuid) from public, anon;
grant execute on function public.admin_record_local_product_sales_on_credit(jsonb, text, numeric, date, uuid) to authenticated;

notify pgrst, 'reload schema';

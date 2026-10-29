-- Remove per-customer credit limits. Debts remain tracked by currency;
-- VES balances keep their USD principal and revalue at the current rate.
-- Services on credit are accepted only in USD or VES; COP remains for products.
-- Run after local-sales-credit-ves-ledger-fix-migration.sql.

drop function if exists public.admin_save_local_sale_customer(uuid, text, text, numeric, numeric, numeric);
create function public.admin_save_local_sale_customer(p_customer_id uuid, p_full_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    clean_name text := nullif(btrim(p_full_name), '');
    clean_phone text := nullif(btrim(p_phone), '');
    saved_customer public.local_sale_customers%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then raise exception 'No tienes permiso para administrar clientes.' using errcode = '42501'; end if;
    if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 120 then raise exception 'El nombre debe tener entre 2 y 120 caracteres.' using errcode = '22023'; end if;
    if clean_phone is null or char_length(clean_phone) < 7 or char_length(clean_phone) > 40 then raise exception 'El telefono debe tener entre 7 y 40 caracteres.' using errcode = '22023'; end if;
    if p_customer_id is null then
        insert into public.local_sale_customers (full_name, phone) values (clean_name, clean_phone) returning * into saved_customer;
    else
        update public.local_sale_customers set full_name = clean_name, phone = clean_phone, updated_at = now()
        where id = p_customer_id and is_active returning * into saved_customer;
        if not found then raise exception 'No se encontro el cliente que intentas actualizar.' using errcode = 'P0002'; end if;
    end if;
    return jsonb_build_object('id', saved_customer.id, 'full_name', saved_customer.full_name, 'phone', saved_customer.phone);
end;
$$;
revoke all on function public.admin_save_local_sale_customer(uuid, text, text) from public, anon;
grant execute on function public.admin_save_local_sale_customer(uuid, text, text) to authenticated;

drop function if exists public.admin_list_local_sale_customers();
create function public.admin_list_local_sale_customers()
returns table (id uuid, full_name text, phone text, balance_usd numeric, balance_ves_usd numeric, balance_cop numeric, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then raise exception 'No tienes permiso para consultar clientes.' using errcode = '42501'; end if;
    return query
    select customer.id, customer.full_name, customer.phone,
        coalesce(sum(case when ledger.currency = 'USD' then case when ledger.entry_type = 'sale' then ledger.amount else -ledger.amount end else 0 end), 0),
        coalesce(sum(case when ledger.currency = 'VES' then case when ledger.entry_type = 'sale' then ledger.amount_usd else -ledger.amount_usd end else 0 end), 0),
        coalesce(sum(case when ledger.currency = 'COP' then case when ledger.entry_type = 'sale' then ledger.amount else -ledger.amount end else 0 end), 0),
        customer.created_at
    from public.local_sale_customers customer left join public.local_sale_credit_ledger ledger on ledger.customer_id = customer.id
    where customer.is_active group by customer.id order by customer.full_name;
end;
$$;
revoke all on function public.admin_list_local_sale_customers() from public, anon;
grant execute on function public.admin_list_local_sale_customers() to authenticated;

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
    if clean_currency = 'COP' and exists (
        select 1 from jsonb_to_recordset(p_items) as line(sale_type text)
        where line.sale_type = 'service'
    ) then
        raise exception 'Los servicios fiados solo se pueden registrar en USD o VES.' using errcode = '22023';
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
            raise exception 'No se pudo calcular la base en USD del fiado en bolivares.'
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
        'credit_balance', displayed_balance + actual_charge
    );
end;
$$;
revoke all on function public.admin_record_local_product_sales_on_credit(jsonb, text, numeric, date, uuid) from public, anon;
grant execute on function public.admin_record_local_product_sales_on_credit(jsonb, text, numeric, date, uuid) to authenticated;

alter table public.local_sale_customers drop column if exists credit_limit_usd, drop column if exists credit_limit_ves, drop column if exists credit_limit_cop;
notify pgrst, 'reload schema';

-- Revalue outstanding VES credit with the current USD/VES rate and preserve
-- the applied rate and USD equivalent for every future VES credit entry.
-- Run after local-sales-credit-migration.sql.

alter table public.local_sale_credit_ledger
    add column if not exists amount_usd numeric(18, 8),
    add column if not exists exchange_rate numeric(18, 6);

-- The only existing VES credit sale has no payments. Convert its opening
-- balance at the app's effective rate on 2026-10-27:
-- API rate Bs. 887.302 + commercial adjustment Bs. 30 = Bs. 917.302 per USD.
do $$
declare
    effective_rate constant numeric(18, 6) := 917.302;
begin
    if exists (
        select 1 from public.local_sale_credit_ledger
        where currency = 'VES' and entry_type = 'payment'
          and (amount_usd is null or exchange_rate is null)
    ) then
        raise exception 'Hay abonos VES anteriores. Revisa sus tasas antes de convertir el historial.';
    end if;

    update public.local_sale_credit_ledger
    set amount_usd = round(amount / effective_rate, 8),
        exchange_rate = effective_rate
    where currency = 'VES' and (amount_usd is null or exchange_rate is null);
end;
$$;

alter table public.local_sale_credit_ledger
    drop constraint if exists local_sale_credit_ledger_ves_rate_fields_check;
alter table public.local_sale_credit_ledger
    add constraint local_sale_credit_ledger_ves_rate_fields_check check (
        (currency = 'VES' and amount_usd > 0 and exchange_rate > 0)
        or (currency <> 'VES' and amount_usd is null and exchange_rate is null)
    );

-- Return the outstanding VES debt's stable USD principal. The admin UI applies
-- the current rate so the displayed bolivar amount changes as the rate moves.
drop function if exists public.admin_list_local_sale_customers();
create function public.admin_list_local_sale_customers()
returns table (
    id uuid,
    full_name text,
    phone text,
    credit_limit_usd numeric,
    credit_limit_ves numeric,
    credit_limit_cop numeric,
    balance_usd numeric,
    balance_ves_usd numeric,
    balance_cop numeric,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar clientes.' using errcode = '42501';
    end if;

    return query
    select customer.id, customer.full_name, customer.phone,
           customer.credit_limit_usd, customer.credit_limit_ves, customer.credit_limit_cop,
           coalesce(sum(case when ledger.currency = 'USD' then
               case when ledger.entry_type = 'sale' then ledger.amount else -ledger.amount end else 0 end), 0),
           coalesce(sum(case when ledger.currency = 'VES' then
               case when ledger.entry_type = 'sale' then ledger.amount_usd else -ledger.amount_usd end else 0 end), 0),
           coalesce(sum(case when ledger.currency = 'COP' then
               case when ledger.entry_type = 'sale' then ledger.amount else -ledger.amount end else 0 end), 0),
           customer.created_at
    from public.local_sale_customers customer
    left join public.local_sale_credit_ledger ledger on ledger.customer_id = customer.id
    where customer.is_active
    group by customer.id
    order by customer.full_name;
end;
$$;
revoke all on function public.admin_list_local_sale_customers() from public, anon;
grant execute on function public.admin_list_local_sale_customers() to authenticated;

-- Keep VES account limits in bolivars; evaluate the current balance at the
-- transaction's captured rate before accepting another credit sale.
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
    sale_usd := case when clean_currency = 'VES'
        then round((sale_result ->> 'total_usd')::numeric, 8)
        else null
    end;
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

-- A VES payment reduces the USD principal using the exact rate captured at
-- payment time. USD/COP balances continue to use their own recorded currency.
drop function if exists public.admin_record_local_customer_payment(uuid, text, numeric, date, text);
drop function if exists public.admin_record_local_customer_payment(uuid, text, numeric, numeric, date, text);
create function public.admin_record_local_customer_payment(
    p_customer_id uuid,
    p_currency text,
    p_amount numeric,
    p_exchange_rate numeric default null,
    p_sold_on date default current_date,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_currency text := upper(btrim(p_currency));
    payment_amount numeric(14, 2);
    payment_usd numeric(18, 8);
    current_balance numeric(18, 8);
    displayed_balance numeric(14, 2);
    saved_exchange_rate numeric(18, 6);
    target_customer public.local_sale_customers%rowtype;
    payment_id uuid := gen_random_uuid();
    clean_note text := nullif(btrim(p_note), '');
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar abonos.' using errcode = '42501';
    end if;
    if clean_currency is null or clean_currency not in ('USD', 'VES', 'COP') then
        raise exception 'La moneda debe ser USD, VES o COP.' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 then
        raise exception 'El abono debe ser mayor que cero y estar dentro del máximo permitido.' using errcode = '22023';
    end if;
    if clean_currency = 'COP' and p_amount <> trunc(p_amount) then
        raise exception 'El abono COP debe ser un número entero.' using errcode = '22023';
    end if;
    if clean_currency = 'VES' then
        if p_exchange_rate is null or p_exchange_rate <= 0 or p_exchange_rate > 1000000000 then
            raise exception 'No hay una tasa USD/VES válida para este abono.' using errcode = '22023';
        end if;
        saved_exchange_rate := round(p_exchange_rate, 6);
    end if;
    payment_amount := case when clean_currency = 'COP' then p_amount else round(p_amount, 2) end;
    if payment_amount <= 0 then
        raise exception 'El abono debe ser mayor que cero.' using errcode = '22023';
    end if;
    if p_sold_on is null or p_sold_on > current_date then
        raise exception 'La fecha del abono no puede estar vacía ni en el futuro.' using errcode = '22023';
    end if;
    if clean_note is not null and char_length(clean_note) > 200 then
        raise exception 'La nota debe tener máximo 200 caracteres.' using errcode = '22023';
    end if;

    select * into target_customer from public.local_sale_customers
    where id = p_customer_id and is_active for update;
    if not found then
        raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0002';
    end if;
    select coalesce(sum(case when entry.entry_type = 'sale'
        then case when clean_currency = 'VES' then entry.amount_usd else entry.amount end
        else -case when clean_currency = 'VES' then entry.amount_usd else entry.amount end
    end), 0)
    into current_balance
    from public.local_sale_credit_ledger entry
    where entry.customer_id = p_customer_id and entry.currency = clean_currency;

    displayed_balance := case when clean_currency = 'VES'
        then round(current_balance * saved_exchange_rate, 2)
        else round(current_balance, 2)
    end;
    if payment_amount > displayed_balance then
        raise exception 'El abono supera la deuda pendiente en %: saldo %.', clean_currency, displayed_balance
            using errcode = '22023';
    end if;
    payment_usd := case when clean_currency = 'VES' then
        case when payment_amount >= displayed_balance then current_balance
             else round(payment_amount / saved_exchange_rate, 8) end
        else null end;

    insert into public.local_sale_credit_ledger (
        id, customer_id, entry_type, currency, amount, amount_usd, exchange_rate,
        sold_on, note, created_by
    ) values (
        payment_id, p_customer_id, 'payment', clean_currency, payment_amount,
        payment_usd, case when clean_currency = 'VES' then saved_exchange_rate end,
        p_sold_on, clean_note, auth.uid()
    );
    return jsonb_build_object(
        'id', payment_id,
        'customer_id', p_customer_id,
        'currency', clean_currency,
        'amount', payment_amount,
        'amount_usd', payment_usd,
        'exchange_rate', saved_exchange_rate,
        'balance', greatest(0, displayed_balance - payment_amount),
        'sold_on', p_sold_on
    );
end;
$$;
revoke all on function public.admin_record_local_customer_payment(uuid, text, numeric, numeric, date, text) from public, anon;
grant execute on function public.admin_record_local_customer_payment(uuid, text, numeric, numeric, date, text) to authenticated;

-- Expose the exchange rate and USD equivalent in the customer's audit trail.
drop function if exists public.admin_list_local_customer_credit_ledger(uuid, integer);
create function public.admin_list_local_customer_credit_ledger(
    p_customer_id uuid,
    p_limit integer default 100
)
returns table (
    id uuid,
    entry_type text,
    currency text,
    amount numeric,
    amount_usd numeric,
    exchange_rate numeric,
    sale_batch_id uuid,
    sold_on date,
    description text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar movimientos de crédito.' using errcode = '42501';
    end if;
    if p_customer_id is null then
        raise exception 'Selecciona un cliente válido.' using errcode = '22023';
    end if;

    return query
    select entry.id, entry.entry_type, entry.currency, entry.amount,
           entry.amount_usd, entry.exchange_rate, entry.sale_batch_id, entry.sold_on,
           case when entry.entry_type = 'sale' then coalesce((
               select string_agg(sale.product_name || ' x ' || sale.quantity, ', ' order by sale.created_at, sale.id)
               from public.local_sales sale where sale.batch_id = entry.sale_batch_id
           ), 'Venta fiada') else coalesce(entry.note, 'Abono registrado') end,
           entry.created_at
    from public.local_sale_credit_ledger entry
    where entry.customer_id = p_customer_id
    order by entry.sold_on desc, entry.created_at desc, entry.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 300));
end;
$$;
revoke all on function public.admin_list_local_customer_credit_ledger(uuid, integer) from public, anon;
grant execute on function public.admin_list_local_customer_credit_ledger(uuid, integer) to authenticated;

notify pgrst, 'reload schema';

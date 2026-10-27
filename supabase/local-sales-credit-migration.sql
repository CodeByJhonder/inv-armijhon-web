-- Customer credit accounts, credit sales and payments for the local store.
-- Run after local-services-migration.sql and local-sales-delete-migration.sql.

create table if not exists public.local_sale_customers (
    id uuid primary key default gen_random_uuid(),
    full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
    phone text not null check (char_length(btrim(phone)) between 7 and 40),
    credit_limit_usd numeric(14, 2) not null default 0 check (credit_limit_usd >= 0),
    credit_limit_ves numeric(14, 2) not null default 0 check (credit_limit_ves >= 0),
    credit_limit_cop numeric(14, 2) not null default 0 check (credit_limit_cop >= 0 and credit_limit_cop = trunc(credit_limit_cop)),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists local_sale_customers_name_idx
    on public.local_sale_customers (lower(full_name));
create index if not exists local_sale_customers_phone_idx
    on public.local_sale_customers (phone);

alter table public.local_sale_customers enable row level security;
revoke all on public.local_sale_customers from public, anon, authenticated;

alter table public.local_sales
    add column if not exists customer_id uuid references public.local_sale_customers(id) on delete restrict;
create index if not exists local_sales_customer_id_idx
    on public.local_sales (customer_id, sold_on desc)
    where customer_id is not null;

create table if not exists public.local_sale_credit_ledger (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.local_sale_customers(id) on delete restrict,
    entry_type text not null check (entry_type in ('sale', 'payment')),
    currency text not null check (currency in ('USD', 'VES', 'COP')),
    amount numeric(14, 2) not null check (amount > 0),
    sale_batch_id uuid,
    sold_on date not null default current_date,
    note text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint local_sale_credit_ledger_batch_check check (
        (entry_type = 'sale' and sale_batch_id is not null)
        or (entry_type = 'payment' and sale_batch_id is null)
    ),
    constraint local_sale_credit_ledger_cop_integer_check check (
        currency <> 'COP' or amount = trunc(amount)
    )
);

create unique index if not exists local_sale_credit_ledger_sale_batch_idx
    on public.local_sale_credit_ledger (sale_batch_id)
    where entry_type = 'sale';
create index if not exists local_sale_credit_ledger_customer_idx
    on public.local_sale_credit_ledger (customer_id, currency, sold_on desc, created_at desc);

alter table public.local_sale_credit_ledger enable row level security;
revoke all on public.local_sale_credit_ledger from public, anon, authenticated;

create or replace function public.admin_save_local_sale_customer(
    p_customer_id uuid,
    p_full_name text,
    p_phone text,
    p_credit_limit_usd numeric,
    p_credit_limit_ves numeric,
    p_credit_limit_cop numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_name text := nullif(btrim(p_full_name), '');
    clean_phone text := nullif(btrim(p_phone), '');
    saved_customer public.local_sale_customers%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para administrar clientes.' using errcode = '42501';
    end if;
    if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 120 then
        raise exception 'El nombre debe tener entre 2 y 120 caracteres.' using errcode = '22023';
    end if;
    if clean_phone is null or char_length(clean_phone) < 7 or char_length(clean_phone) > 40 then
        raise exception 'El teléfono debe tener entre 7 y 40 caracteres.' using errcode = '22023';
    end if;
    if p_credit_limit_usd is null or p_credit_limit_usd < 0 or p_credit_limit_usd > 999999999999.99
       or p_credit_limit_ves is null or p_credit_limit_ves < 0 or p_credit_limit_ves > 999999999999.99
       or p_credit_limit_cop is null or p_credit_limit_cop < 0 or p_credit_limit_cop > 999999999999.99
       or p_credit_limit_cop <> trunc(p_credit_limit_cop) then
        raise exception 'Revisa los límites: deben ser positivos, COP entero y estar dentro del máximo permitido.' using errcode = '22023';
    end if;

    if p_customer_id is null then
        insert into public.local_sale_customers (
            full_name, phone, credit_limit_usd, credit_limit_ves, credit_limit_cop
        ) values (
            clean_name, clean_phone, p_credit_limit_usd, p_credit_limit_ves, p_credit_limit_cop
        ) returning * into saved_customer;
    else
        update public.local_sale_customers
        set full_name = clean_name,
            phone = clean_phone,
            credit_limit_usd = p_credit_limit_usd,
            credit_limit_ves = p_credit_limit_ves,
            credit_limit_cop = p_credit_limit_cop,
            updated_at = now()
        where id = p_customer_id and is_active
        returning * into saved_customer;
        if not found then
            raise exception 'No se encontró el cliente que intentas actualizar.' using errcode = 'P0002';
        end if;
    end if;

    return jsonb_build_object(
        'id', saved_customer.id,
        'full_name', saved_customer.full_name,
        'phone', saved_customer.phone,
        'credit_limit_usd', saved_customer.credit_limit_usd,
        'credit_limit_ves', saved_customer.credit_limit_ves,
        'credit_limit_cop', saved_customer.credit_limit_cop
    );
end;
$$;
revoke all on function public.admin_save_local_sale_customer(uuid, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_save_local_sale_customer(uuid, text, text, numeric, numeric, numeric) to authenticated;

create or replace function public.admin_list_local_sale_customers()
returns table (
    id uuid,
    full_name text,
    phone text,
    credit_limit_usd numeric,
    credit_limit_ves numeric,
    credit_limit_cop numeric,
    balance_usd numeric,
    balance_ves numeric,
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
               case when ledger.entry_type = 'sale' then ledger.amount else -ledger.amount end else 0 end), 0),
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
    current_balance numeric(14, 2);
    credit_limit numeric(14, 2);
    expected_charge numeric(14, 2);
    actual_charge numeric(14, 2);
    batch_value uuid;
    sale_result jsonb;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar ventas fiadas.' using errcode = '42501';
    end if;
    if p_customer_id is null then
        raise exception 'Selecciona el cliente de esta venta fiada.' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'La venta debe tener una lista válida de productos o servicios.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
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

    select coalesce(sum(case when entry.entry_type = 'sale' then entry.amount else -entry.amount end), 0)
    into current_balance
    from public.local_sale_credit_ledger entry
    where entry.customer_id = p_customer_id and entry.currency = clean_currency;

    credit_limit := case clean_currency
        when 'USD' then target_customer.credit_limit_usd
        when 'VES' then target_customer.credit_limit_ves
        else target_customer.credit_limit_cop
    end;
    if credit_limit <= 0 or current_balance + expected_charge > credit_limit then
        raise exception 'La venta supera el crédito disponible en %: saldo %, venta %, límite %.',
            clean_currency, current_balance, expected_charge, credit_limit
            using errcode = 'P0001';
    end if;

    -- Reuse the established atomic sale operation. Any later error rolls back its
    -- inventory changes and sale rows together with this credit ledger entry.
    sale_result := public.admin_record_local_product_sales(
        p_items, clean_currency, saved_exchange_rate, p_sold_on
    );
    batch_value := (sale_result ->> 'batch_id')::uuid;
    actual_charge := round((sale_result ->> 'total_amount')::numeric, 2);
    if actual_charge <> expected_charge then
        raise exception 'El total calculado no coincide; no se registró la venta.' using errcode = '22023';
    end if;

    update public.local_sales
    set customer_id = p_customer_id
    where batch_id = batch_value;

    insert into public.local_sale_credit_ledger (
        customer_id, entry_type, currency, amount, sale_batch_id, sold_on, note, created_by
    ) values (
        p_customer_id, 'sale', clean_currency, actual_charge, batch_value, p_sold_on,
        'Venta local fiada', auth.uid()
    );

    return sale_result || jsonb_build_object(
        'is_credit', true,
        'customer_id', p_customer_id,
        'customer_name', target_customer.full_name,
        'credit_balance', current_balance + actual_charge,
        'credit_available', greatest(0, credit_limit - current_balance - actual_charge)
    );
end;
$$;
revoke all on function public.admin_record_local_product_sales_on_credit(jsonb, text, numeric, date, uuid) from public, anon;
grant execute on function public.admin_record_local_product_sales_on_credit(jsonb, text, numeric, date, uuid) to authenticated;

create or replace function public.admin_record_local_customer_payment(
    p_customer_id uuid,
    p_currency text,
    p_amount numeric,
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
    current_balance numeric(14, 2);
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
    select coalesce(sum(case when entry.entry_type = 'sale' then entry.amount else -entry.amount end), 0)
    into current_balance
    from public.local_sale_credit_ledger entry
    where entry.customer_id = p_customer_id and entry.currency = clean_currency;
    if payment_amount > current_balance then
        raise exception 'El abono supera la deuda pendiente en %: saldo %.', clean_currency, current_balance
            using errcode = '22023';
    end if;

    insert into public.local_sale_credit_ledger (
        id, customer_id, entry_type, currency, amount, sold_on, note, created_by
    ) values (
        payment_id, p_customer_id, 'payment', clean_currency, payment_amount,
        p_sold_on, clean_note, auth.uid()
    );
    return jsonb_build_object(
        'id', payment_id,
        'customer_id', p_customer_id,
        'currency', clean_currency,
        'amount', payment_amount,
        'balance', current_balance - payment_amount,
        'sold_on', p_sold_on
    );
end;
$$;
revoke all on function public.admin_record_local_customer_payment(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.admin_record_local_customer_payment(uuid, text, numeric, date, text) to authenticated;

create or replace function public.admin_list_local_customer_credit_ledger(
    p_customer_id uuid,
    p_limit integer default 100
)
returns table (
    id uuid,
    entry_type text,
    currency text,
    amount numeric,
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
    select entry.id, entry.entry_type, entry.currency, entry.amount, entry.sale_batch_id,
           entry.sold_on,
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

-- Include the account holder in the local sales history cards.
drop function if exists public.admin_list_local_sales(integer);
create function public.admin_list_local_sales(p_limit integer default 200)
returns table (
    id uuid, batch_id uuid, sale_type text, product_id text, service_id uuid,
    customer_id uuid, customer_name text, product_name text, quantity integer, unit text,
    unit_price_usd numeric, total_usd numeric, currency text, total_amount numeric,
    exchange_rate numeric, sold_on date, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar ventas locales.' using errcode = '42501';
    end if;
    return query
    select sale.id, sale.batch_id, sale.sale_type, sale.product_id, sale.service_id,
           sale.customer_id, customer.full_name, sale.product_name, sale.quantity, sale.unit,
           sale.unit_price_usd, sale.total_usd, sale.currency, sale.total_amount,
           sale.exchange_rate, sale.sold_on, sale.created_at
    from public.local_sales sale
    left join public.local_sale_customers customer on customer.id = sale.customer_id
    order by sale.sold_on desc, sale.created_at desc, sale.id desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;
revoke all on function public.admin_list_local_sales(integer) from public, anon;
grant execute on function public.admin_list_local_sales(integer) to authenticated;

-- Keep credit sale audit rows while outstanding balances or payments exist.
create or replace function public.admin_delete_local_sales(
    p_sale_ids uuid[] default null,
    p_from date default null,
    p_through date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted_count integer;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para eliminar ventas locales.' using errcode = '42501';
    end if;
    if p_sale_ids is not null then
        if cardinality(p_sale_ids) < 1 or cardinality(p_sale_ids) > 200
           or p_from is not null or p_through is not null then
            raise exception 'La selección de ventas no es válida.' using errcode = '22023';
        end if;
        if exists (
            select 1 from public.local_sales sale
            join public.local_sale_credit_ledger ledger on ledger.sale_batch_id = sale.batch_id
            where sale.id = any(p_sale_ids) and ledger.entry_type = 'sale'
        ) then
            raise exception 'Las ventas fiadas se conservan para mantener el historial de deuda y abonos.' using errcode = '22023';
        end if;
        delete from public.local_sales where id = any(p_sale_ids);
    else
        if p_from is null or p_through is null or p_from > p_through
           or p_through > current_date or p_through - p_from > 370 then
            raise exception 'El período indicado no es válido.' using errcode = '22023';
        end if;
        if exists (
            select 1 from public.local_sales sale
            join public.local_sale_credit_ledger ledger on ledger.sale_batch_id = sale.batch_id
            where sale.sold_on between p_from and p_through and ledger.entry_type = 'sale'
        ) then
            raise exception 'El período contiene ventas fiadas, que se conservan para mantener el historial de deuda y abonos.' using errcode = '22023';
        end if;
        delete from public.local_sales where sold_on between p_from and p_through;
    end if;
    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;
revoke all on function public.admin_delete_local_sales(uuid[], date, date) from public, anon;
grant execute on function public.admin_delete_local_sales(uuid[], date, date) to authenticated;

notify pgrst, 'reload schema';

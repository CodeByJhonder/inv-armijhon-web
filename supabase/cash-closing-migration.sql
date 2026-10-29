-- Cierre de caja unificado para ventas locales (tienda fisica) y pedidos web (pagina).
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.cash_closings (
    id uuid primary key default gen_random_uuid(),
    closing_date date not null unique,
    exchange_rate numeric(18, 6) not null default 1,

    -- Ventas locales (Contado)
    local_cash_usd numeric(14, 2) not null default 0,
    local_cash_ves numeric(14, 2) not null default 0,
    local_cash_cop numeric(14, 2) not null default 0,

    -- Ventas locales (Fiado / Credito otorgado hoy)
    local_credit_usd numeric(14, 2) not null default 0,
    local_credit_ves numeric(14, 2) not null default 0,
    local_credit_cop numeric(14, 2) not null default 0,

    -- Cobranzas / Abonos de fiados recibidos hoy
    local_payments_usd numeric(14, 2) not null default 0,
    local_payments_ves numeric(14, 2) not null default 0,
    local_payments_cop numeric(14, 2) not null default 0,

    -- Cantidad de operaciones locales
    local_sales_count integer not null default 0,
    local_credit_count integer not null default 0,
    local_payments_count integer not null default 0,

    -- Ventas de la pagina web (aprobadas y completadas)
    web_sales_count integer not null default 0,
    web_pending_count integer not null default 0,
    web_pago_movil_count integer not null default 0,
    web_pago_movil_ves numeric(14, 2) not null default 0,
    web_transfer_count integer not null default 0,
    web_transfer_ves numeric(14, 2) not null default 0,
    web_total_usd numeric(14, 2) not null default 0,
    web_total_ves numeric(14, 2) not null default 0,

    -- Totales en caja fisica (Efectivo contado + Abonos cobrados)
    total_physical_cash_usd numeric(14, 2) not null default 0,
    total_physical_cash_ves numeric(14, 2) not null default 0,
    total_physical_cash_cop numeric(14, 2) not null default 0,

    -- Total en cuenta bancaria digital (Pagos web)
    total_digital_ves numeric(14, 2) not null default 0,

    -- Gran total consolidado del dia
    grand_total_usd numeric(14, 2) not null default 0,
    grand_total_ves numeric(14, 2) not null default 0,
    total_transactions integer not null default 0,

    -- Detalle desglosado en formato JSON
    details jsonb not null default '{}'::jsonb,
    notes text,
    closed_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists cash_closings_date_idx on public.cash_closings (closing_date desc);

alter table public.cash_closings enable row level security;
revoke all on public.cash_closings from public, anon, authenticated;

-- Politica para que administradores autenticados puedan consultar cierres si usan SELECT directo
create policy "authenticated admins can select cash closings"
on public.cash_closings for select
to authenticated
using (public.is_chat_admin());

-- Funcion para previsualizar el cierre de un dia sin guardarlo
create or replace function public.admin_preview_cash_closing(
    p_closing_date date,
    p_exchange_rate numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_rate numeric(18, 6);
    v_local_cash_usd numeric(14, 2) := 0;
    v_local_cash_ves numeric(14, 2) := 0;
    v_local_cash_cop numeric(14, 2) := 0;
    v_local_credit_usd numeric(14, 2) := 0;
    v_local_credit_ves numeric(14, 2) := 0;
    v_local_credit_cop numeric(14, 2) := 0;
    v_local_payments_usd numeric(14, 2) := 0;
    v_local_payments_ves numeric(14, 2) := 0;
    v_local_payments_cop numeric(14, 2) := 0;
    v_local_sales_count integer := 0;
    v_local_credit_count integer := 0;
    v_local_payments_count integer := 0;

    v_web_sales_count integer := 0;
    v_web_pending_count integer := 0;
    v_web_pago_movil_count integer := 0;
    v_web_pago_movil_ves numeric(14, 2) := 0;
    v_web_transfer_count integer := 0;
    v_web_transfer_ves numeric(14, 2) := 0;
    v_web_total_usd numeric(14, 2) := 0;
    v_web_total_ves numeric(14, 2) := 0;

    v_local_sales_list jsonb := '[]'::jsonb;
    v_web_orders_list jsonb := '[]'::jsonb;
    v_existing_closing jsonb := null;
    v_existing_row public.cash_closings%rowtype;

    v_total_cash_usd numeric(14, 2) := 0;
    v_total_cash_ves numeric(14, 2) := 0;
    v_total_cash_cop numeric(14, 2) := 0;
    v_total_digital_ves numeric(14, 2) := 0;
    v_grand_total_usd numeric(14, 2) := 0;
    v_grand_total_ves numeric(14, 2) := 0;
    v_total_transactions integer := 0;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar el cierre de caja.' using errcode = '42501';
    end if;

    if p_closing_date is null or p_closing_date > current_date then
        raise exception 'Indica una fecha valida que no sea futura.' using errcode = '22023';
    end if;

    -- Tasa de cambio de referencia
    if p_exchange_rate is not null and p_exchange_rate > 0 then
        v_rate := round(p_exchange_rate, 6);
    else
        -- Intentar tomar la ultima tasa registrada en ventas locales de ese dia, o 1
        select coalesce(exchange_rate, 1) into v_rate
        from public.local_sales
        where sold_on = p_closing_date and exchange_rate is not null and exchange_rate > 0
        order by created_at desc
        limit 1;

        if v_rate is null or v_rate <= 0 then
            v_rate := 1;
        end if;
    end if;

    -- 1. Ventas Locales: Contado vs Fiado
    -- Contado (customer_id is null)
    select
        coalesce(sum(case when currency = 'USD' then total_amount else 0 end), 0),
        coalesce(sum(case when currency = 'VES' then total_amount else 0 end), 0),
        coalesce(sum(case when currency = 'COP' then total_amount else 0 end), 0),
        count(distinct coalesce(batch_id, id))
    into
        v_local_cash_usd, v_local_cash_ves, v_local_cash_cop, v_local_sales_count
    from public.local_sales
    where sold_on = p_closing_date and customer_id is null;

    -- Fiado (customer_id is not null)
    select
        coalesce(sum(case when currency = 'USD' then total_amount else 0 end), 0),
        coalesce(sum(case when currency = 'VES' then total_amount else 0 end), 0),
        coalesce(sum(case when currency = 'COP' then total_amount else 0 end), 0),
        count(distinct coalesce(batch_id, id))
    into
        v_local_credit_usd, v_local_credit_ves, v_local_credit_cop, v_local_credit_count
    from public.local_sales
    where sold_on = p_closing_date and customer_id is not null;

    -- 2. Abonos de Fiados (cobros recibidos hoy por cuentas por cobrar)
    select
        coalesce(sum(case when currency = 'USD' then amount else 0 end), 0),
        coalesce(sum(case when currency = 'VES' then amount else 0 end), 0),
        coalesce(sum(case when currency = 'COP' then amount else 0 end), 0),
        count(*)
    into
        v_local_payments_usd, v_local_payments_ves, v_local_payments_cop, v_local_payments_count
    from public.local_sale_credit_ledger
    where sold_on = p_closing_date and entry_type = 'payment';

    -- 3. Lista de ventas locales del dia para detalle
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'batch_id', s.batch_id,
        'product_name', s.product_name,
        'quantity', s.quantity,
        'unit', s.unit,
        'currency', s.currency,
        'total_amount', s.total_amount,
        'sale_type', s.sale_type,
        'is_credit', (s.customer_id is not null),
        'customer_name', c.full_name,
        'created_at', s.created_at
    ) order by s.created_at asc), '[]'::jsonb)
    into v_local_sales_list
    from public.local_sales s
    left join public.local_sale_customers c on c.id = s.customer_id
    where s.sold_on = p_closing_date;

    -- 4. Ventas desde la Pagina Web
    -- Pedidos Aprobados y Completados
    select
        count(*),
        coalesce(sum(total_usd), 0),
        coalesce(sum(total_ves), 0),
        count(*) filter (where payment_method = 'pago_movil'),
        coalesce(sum(case when payment_method = 'pago_movil' then total_ves else 0 end), 0),
        count(*) filter (where payment_method = 'transferencia'),
        coalesce(sum(case when payment_method = 'transferencia' then total_ves else 0 end), 0)
    into
        v_web_sales_count, v_web_total_usd, v_web_total_ves,
        v_web_pago_movil_count, v_web_pago_movil_ves,
        v_web_transfer_count, v_web_transfer_ves
    from public.orders
    where (created_at at time zone 'America/Caracas')::date = p_closing_date
      and status in ('approved', 'completed');

    -- Pedidos pendientes de revision en la web hoy
    select count(*)
    into v_web_pending_count
    from public.orders
    where (created_at at time zone 'America/Caracas')::date = p_closing_date
      and status = 'pending';

    -- Lista de pedidos web del dia
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'payment_method', o.payment_method,
        'total_usd', o.total_usd,
        'total_ves', o.total_ves,
        'exchange_rate', o.exchange_rate,
        'status', o.status,
        'created_at', o.created_at
    ) order by o.created_at asc), '[]'::jsonb)
    into v_web_orders_list
    from public.orders o
    where (o.created_at at time zone 'America/Caracas')::date = p_closing_date
      and o.status in ('approved', 'completed');

    -- 5. Consolidacion de Totales
    -- Total efectivo que debe haber fisicamente en la tienda
    v_total_cash_usd := v_local_cash_usd + v_local_payments_usd;
    v_total_cash_ves := v_local_cash_ves + v_local_payments_ves;
    v_total_cash_cop := v_local_cash_cop + v_local_payments_cop;

    -- Total en cuenta digital (Banco web)
    v_total_digital_ves := v_web_total_ves;

    -- Total de transacciones efectivas
    v_total_transactions := v_local_sales_count + v_local_payments_count + v_web_sales_count;

    -- Gran total consolidado en USD (sumando USD directo + VES convertidos a USD a la tasa del dia)
    if v_rate > 0 then
        v_grand_total_usd := round(
            v_total_cash_usd + v_web_total_usd +
            (v_local_cash_ves + v_local_payments_ves) / v_rate +
            (v_local_credit_usd + v_local_credit_ves / v_rate),
            2
        );
        v_grand_total_ves := round(
            (v_total_cash_usd + v_local_credit_usd) * v_rate +
            v_total_cash_ves + v_local_credit_ves + v_web_total_ves,
            2
        );
    else
        v_grand_total_usd := v_total_cash_usd + v_web_total_usd + v_local_credit_usd;
        v_grand_total_ves := v_total_cash_ves + v_local_credit_ves + v_web_total_ves;
    end if;

    -- 6. Verificar si ya existe cierre previo para esta fecha
    select * into v_existing_row
    from public.cash_closings
    where closing_date = p_closing_date;

    if found then
        v_existing_closing := jsonb_build_object(
            'id', v_existing_row.id,
            'closing_date', v_existing_row.closing_date,
            'closed_at', v_existing_row.created_at,
            'updated_at', v_existing_row.updated_at,
            'notes', v_existing_row.notes,
            'grand_total_usd', v_existing_row.grand_total_usd,
            'grand_total_ves', v_existing_row.grand_total_ves
        );
    end if;

    return jsonb_build_object(
        'closing_date', p_closing_date,
        'exchange_rate', v_rate,
        'is_already_closed', (v_existing_closing is not null),
        'existing_closing', v_existing_closing,
        'local_sales', jsonb_build_object(
            'sales_count', v_local_sales_count,
            'credit_count', v_local_credit_count,
            'payments_count', v_local_payments_count,
            'cash_usd', v_local_cash_usd,
            'cash_ves', v_local_cash_ves,
            'cash_cop', v_local_cash_cop,
            'credit_usd', v_local_credit_usd,
            'credit_ves', v_local_credit_ves,
            'credit_cop', v_local_credit_cop,
            'payments_usd', v_local_payments_usd,
            'payments_ves', v_local_payments_ves,
            'payments_cop', v_local_payments_cop,
            'total_physical_usd', v_total_cash_usd,
            'total_physical_ves', v_total_cash_ves,
            'total_physical_cop', v_total_cash_cop,
            'items', v_local_sales_list
        ),
        'web_sales', jsonb_build_object(
            'sales_count', v_web_sales_count,
            'pending_count', v_web_pending_count,
            'pago_movil_count', v_web_pago_movil_count,
            'pago_movil_ves', v_web_pago_movil_ves,
            'transfer_count', v_web_transfer_count,
            'transfer_ves', v_web_transfer_ves,
            'total_usd', v_web_total_usd,
            'total_ves', v_web_total_ves,
            'orders', v_web_orders_list
        ),
        'consolidation', jsonb_build_object(
            'total_physical_cash_usd', v_total_cash_usd,
            'total_physical_cash_ves', v_total_cash_ves,
            'total_physical_cash_cop', v_total_cash_cop,
            'total_digital_ves', v_total_digital_ves,
            'grand_total_usd', v_grand_total_usd,
            'grand_total_ves', v_grand_total_ves,
            'total_transactions', v_total_transactions
        )
    );
end;
$$;

revoke all on function public.admin_preview_cash_closing(date, numeric) from public, anon;
grant execute on function public.admin_preview_cash_closing(date, numeric) to authenticated;

-- Funcion para guardar/registrar formalmente el cierre de caja
create or replace function public.admin_save_cash_closing(
    p_closing_date date,
    p_exchange_rate numeric default null,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_preview jsonb;
    v_rate numeric(18, 6);
    v_record public.cash_closings%rowtype;
    v_clean_notes text := nullif(btrim(p_notes), '');
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar el cierre de caja.' using errcode = '42501';
    end if;

    if p_closing_date is null or p_closing_date > current_date then
        raise exception 'Indica una fecha valida que no sea futura.' using errcode = '22023';
    end if;

    -- Obtener la previsualizacion con todos los calculos consolidados
    v_preview := public.admin_preview_cash_closing(p_closing_date, p_exchange_rate);
    v_rate := (v_preview ->> 'exchange_rate')::numeric;

    -- Upsert en la tabla cash_closings
    insert into public.cash_closings (
        closing_date,
        exchange_rate,

        local_cash_usd,
        local_cash_ves,
        local_cash_cop,
        local_credit_usd,
        local_credit_ves,
        local_credit_cop,
        local_payments_usd,
        local_payments_ves,
        local_payments_cop,
        local_sales_count,
        local_credit_count,
        local_payments_count,

        web_sales_count,
        web_pending_count,
        web_pago_movil_count,
        web_pago_movil_ves,
        web_transfer_count,
        web_transfer_ves,
        web_total_usd,
        web_total_ves,

        total_physical_cash_usd,
        total_physical_cash_ves,
        total_physical_cash_cop,
        total_digital_ves,
        grand_total_usd,
        grand_total_ves,
        total_transactions,

        details,
        notes,
        closed_by,
        created_at,
        updated_at
    ) values (
        p_closing_date,
        v_rate,

        (v_preview -> 'local_sales' ->> 'cash_usd')::numeric,
        (v_preview -> 'local_sales' ->> 'cash_ves')::numeric,
        (v_preview -> 'local_sales' ->> 'cash_cop')::numeric,
        (v_preview -> 'local_sales' ->> 'credit_usd')::numeric,
        (v_preview -> 'local_sales' ->> 'credit_ves')::numeric,
        (v_preview -> 'local_sales' ->> 'credit_cop')::numeric,
        (v_preview -> 'local_sales' ->> 'payments_usd')::numeric,
        (v_preview -> 'local_sales' ->> 'payments_ves')::numeric,
        (v_preview -> 'local_sales' ->> 'payments_cop')::numeric,
        (v_preview -> 'local_sales' ->> 'sales_count')::integer,
        (v_preview -> 'local_sales' ->> 'credit_count')::integer,
        (v_preview -> 'local_sales' ->> 'payments_count')::integer,

        (v_preview -> 'web_sales' ->> 'sales_count')::integer,
        (v_preview -> 'web_sales' ->> 'pending_count')::integer,
        (v_preview -> 'web_sales' ->> 'pago_movil_count')::integer,
        (v_preview -> 'web_sales' ->> 'pago_movil_ves')::numeric,
        (v_preview -> 'web_sales' ->> 'transfer_count')::integer,
        (v_preview -> 'web_sales' ->> 'transfer_ves')::numeric,
        (v_preview -> 'web_sales' ->> 'total_usd')::numeric,
        (v_preview -> 'web_sales' ->> 'total_ves')::numeric,

        (v_preview -> 'consolidation' ->> 'total_physical_cash_usd')::numeric,
        (v_preview -> 'consolidation' ->> 'total_physical_cash_ves')::numeric,
        (v_preview -> 'consolidation' ->> 'total_physical_cash_cop')::numeric,
        (v_preview -> 'consolidation' ->> 'total_digital_ves')::numeric,
        (v_preview -> 'consolidation' ->> 'grand_total_usd')::numeric,
        (v_preview -> 'consolidation' ->> 'grand_total_ves')::numeric,
        (v_preview -> 'consolidation' ->> 'total_transactions')::integer,

        v_preview,
        v_clean_notes,
        auth.uid(),
        now(),
        now()
    )
    on conflict (closing_date) do update set
        exchange_rate = excluded.exchange_rate,
        local_cash_usd = excluded.local_cash_usd,
        local_cash_ves = excluded.local_cash_ves,
        local_cash_cop = excluded.local_cash_cop,
        local_credit_usd = excluded.local_credit_usd,
        local_credit_ves = excluded.local_credit_ves,
        local_credit_cop = excluded.local_credit_cop,
        local_payments_usd = excluded.local_payments_usd,
        local_payments_ves = excluded.local_payments_ves,
        local_payments_cop = excluded.local_payments_cop,
        local_sales_count = excluded.local_sales_count,
        local_credit_count = excluded.local_credit_count,
        local_payments_count = excluded.local_payments_count,
        web_sales_count = excluded.web_sales_count,
        web_pending_count = excluded.web_pending_count,
        web_pago_movil_count = excluded.web_pago_movil_count,
        web_pago_movil_ves = excluded.web_pago_movil_ves,
        web_transfer_count = excluded.web_transfer_count,
        web_transfer_ves = excluded.web_transfer_ves,
        web_total_usd = excluded.web_total_usd,
        web_total_ves = excluded.web_total_ves,
        total_physical_cash_usd = excluded.total_physical_cash_usd,
        total_physical_cash_ves = excluded.total_physical_cash_ves,
        total_physical_cash_cop = excluded.total_physical_cash_cop,
        total_digital_ves = excluded.total_digital_ves,
        grand_total_usd = excluded.grand_total_usd,
        grand_total_ves = excluded.grand_total_ves,
        total_transactions = excluded.total_transactions,
        details = excluded.details,
        notes = coalesce(excluded.notes, cash_closings.notes),
        closed_by = auth.uid(),
        updated_at = now()
    returning * into v_record;

    return jsonb_build_object(
        'id', v_record.id,
        'closing_date', v_record.closing_date,
        'exchange_rate', v_record.exchange_rate,
        'grand_total_usd', v_record.grand_total_usd,
        'grand_total_ves', v_record.grand_total_ves,
        'total_transactions', v_record.total_transactions,
        'total_physical_cash_usd', v_record.total_physical_cash_usd,
        'total_physical_cash_ves', v_record.total_physical_cash_ves,
        'total_physical_cash_cop', v_record.total_physical_cash_cop,
        'total_digital_ves', v_record.total_digital_ves,
        'notes', v_record.notes,
        'created_at', v_record.created_at,
        'updated_at', v_record.updated_at
    );
end;
$$;

revoke all on function public.admin_save_cash_closing(date, numeric, text) from public, anon;
grant execute on function public.admin_save_cash_closing(date, numeric, text) to authenticated;

-- Funcion para listar el historial de cierres de caja anteriores
create or replace function public.admin_list_cash_closings(p_limit integer default 30)
returns table (
    id uuid,
    closing_date date,
    exchange_rate numeric,
    grand_total_usd numeric,
    grand_total_ves numeric,
    total_physical_cash_usd numeric,
    total_physical_cash_ves numeric,
    total_physical_cash_cop numeric,
    total_digital_ves numeric,
    local_sales_count integer,
    web_sales_count integer,
    total_transactions integer,
    notes text,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar el historial de cierres de caja.' using errcode = '42501';
    end if;

    return query
    select
        c.id,
        c.closing_date,
        c.exchange_rate,
        c.grand_total_usd,
        c.grand_total_ves,
        c.total_physical_cash_usd,
        c.total_physical_cash_ves,
        c.total_physical_cash_cop,
        c.total_digital_ves,
        c.local_sales_count,
        c.web_sales_count,
        c.total_transactions,
        c.notes,
        c.created_at,
        c.updated_at
    from public.cash_closings c
    order by c.closing_date desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

revoke all on function public.admin_list_cash_closings(integer) from public, anon;
grant execute on function public.admin_list_cash_closings(integer) to authenticated;

-- Funcion para obtener un cierre especifico con su detalle completo
create or replace function public.admin_get_cash_closing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_record public.cash_closings%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar el cierre de caja.' using errcode = '42501';
    end if;

    select * into v_record
    from public.cash_closings
    where id = p_id;

    if not found then
        raise exception 'No se encontro el cierre de caja solicitado.' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'id', v_record.id,
        'closing_date', v_record.closing_date,
        'exchange_rate', v_record.exchange_rate,
        'local_cash_usd', v_record.local_cash_usd,
        'local_cash_ves', v_record.local_cash_ves,
        'local_cash_cop', v_record.local_cash_cop,
        'local_credit_usd', v_record.local_credit_usd,
        'local_credit_ves', v_record.local_credit_ves,
        'local_credit_cop', v_record.local_credit_cop,
        'local_payments_usd', v_record.local_payments_usd,
        'local_payments_ves', v_record.local_payments_ves,
        'local_payments_cop', v_record.local_payments_cop,
        'local_sales_count', v_record.local_sales_count,
        'web_sales_count', v_record.web_sales_count,
        'web_pago_movil_ves', v_record.web_pago_movil_ves,
        'web_transfer_ves', v_record.web_transfer_ves,
        'total_physical_cash_usd', v_record.total_physical_cash_usd,
        'total_physical_cash_ves', v_record.total_physical_cash_ves,
        'total_physical_cash_cop', v_record.total_physical_cash_cop,
        'total_digital_ves', v_record.total_digital_ves,
        'grand_total_usd', v_record.grand_total_usd,
        'grand_total_ves', v_record.grand_total_ves,
        'total_transactions', v_record.total_transactions,
        'details', v_record.details,
        'notes', v_record.notes,
        'created_at', v_record.created_at,
        'updated_at', v_record.updated_at
    );
end;
$$;

revoke all on function public.admin_get_cash_closing(uuid) from public, anon;
grant execute on function public.admin_get_cash_closing(uuid) to authenticated;

notify pgrst, 'reload schema';


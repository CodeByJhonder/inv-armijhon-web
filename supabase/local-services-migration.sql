-- Add a small admin-managed services catalog to local sales.
-- Run after local-sales-export-migration.sql (and the previous local sales migrations).

create table if not exists public.local_sale_services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    unit text not null default 'servicio' check (unit in ('servicio', 'pagina', 'unidad')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    constraint local_sale_services_name_ci_unique unique (name)
);

create unique index if not exists local_sale_services_name_ci_idx
    on public.local_sale_services (lower(name));
insert into public.local_sale_services (name, unit) values
    ('Fotocopia blanco y negro', 'pagina'),
    ('Fotocopia a color', 'pagina'),
    ('Impresión blanco y negro', 'pagina'),
    ('Impresión a color', 'pagina'),
    ('Escaneo', 'pagina'),
    ('Otro servicio', 'servicio')
on conflict do nothing;
alter table public.local_sale_services enable row level security;
revoke all on public.local_sale_services from public, anon, authenticated;

alter table public.local_sales add column if not exists service_id uuid;
alter table public.local_sales drop constraint if exists local_sales_unit_check;
alter table public.local_sales add constraint local_sales_unit_check check (unit in ('unidad', 'metro', 'servicio', 'pagina'));
alter table public.local_sales drop constraint if exists local_sales_product_required;
alter table public.local_sales drop constraint if exists local_sales_service_id_fkey;
alter table public.local_sales drop constraint if exists local_sales_product_or_service_check;
alter table public.local_sales drop constraint if exists local_sales_currency_fields_check;
alter table public.local_sales
    add constraint local_sales_service_id_fkey foreign key (service_id)
        references public.local_sale_services(id) on delete restrict,
    add constraint local_sales_product_or_service_check check (
        (sale_type = 'product' and product_id is not null and service_id is null)
        or (sale_type = 'service' and product_id is null and service_id is not null)
    ),
    add constraint local_sales_currency_fields_check check (
        (currency = 'USD' and unit_price_usd is not null and total_usd is not null
            and exchange_rate is null and total_amount = total_usd)
        or (currency = 'VES' and unit_price_usd is not null and total_usd is not null
            and exchange_rate is not null and total_amount = round(total_usd * exchange_rate, 2))
        or (currency = 'COP' and unit_price_usd is null and total_usd is null
            and exchange_rate is null and total_amount = trunc(total_amount))
    );

create or replace function public.admin_list_local_sale_services()
returns table (id uuid, name text, unit text)
language plpgsql stable security definer set search_path = '' as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar servicios.' using errcode = '42501';
    end if;
    return query select service.id, service.name, service.unit
    from public.local_sale_services service where service.is_active order by service.name;
end;
$$;
revoke all on function public.admin_list_local_sale_services() from public, anon;
grant execute on function public.admin_list_local_sale_services() to authenticated;

create or replace function public.admin_create_local_sale_service(p_name text, p_unit text default 'servicio')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean_name text := nullif(btrim(p_name), ''); saved_service public.local_sale_services%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para agregar servicios.' using errcode = '42501';
    end if;
    if clean_name is null or char_length(clean_name) > 120 then
        raise exception 'El nombre es obligatorio y debe tener máximo 120 caracteres.' using errcode = '22023';
    end if;
    if p_unit is null or p_unit not in ('servicio', 'pagina', 'unidad') then
        raise exception 'La unidad debe ser servicio, pagina o unidad.' using errcode = '22023';
    end if;
    insert into public.local_sale_services(name, unit) values (clean_name, p_unit)
    on conflict (name) do update set is_active = true
    returning * into saved_service;
    return jsonb_build_object('id', saved_service.id, 'name', saved_service.name, 'unit', saved_service.unit);
exception when unique_violation then
    raise exception 'Ya existe un servicio con ese nombre.' using errcode = '23505';
end;
$$;
revoke all on function public.admin_create_local_sale_service(text, text) from public, anon;
grant execute on function public.admin_create_local_sale_service(text, text) to authenticated;

drop function if exists public.admin_record_local_product_sales(jsonb, text, numeric, date);
create function public.admin_record_local_product_sales(
    p_items jsonb, p_currency text, p_exchange_rate numeric, p_sold_on date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    batch_value uuid := gen_random_uuid();
    clean_currency text := upper(btrim(p_currency));
    saved_exchange_rate numeric(18,6);
    input_line record;
    inventory_total record;
    target_product public.product_inventory%rowtype;
    service_value public.local_sale_services%rowtype;
    item_count integer;
    sale_total numeric;
    result_sales jsonb;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar ventas locales.' using errcode = '42501';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'Agrega una lista válida de productos o servicios.' using errcode = '22023';
    end if;
    item_count := jsonb_array_length(p_items);
    if item_count < 1 or item_count > 30 then
        raise exception 'La venta debe tener entre 1 y 30 líneas.' using errcode = '22023';
    end if;
    if clean_currency not in ('USD', 'VES', 'COP') then
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

    for input_line in select * from jsonb_to_recordset(p_items)
        as line(sale_type text, product_id text, service_id uuid, quantity integer, amount numeric)
    loop
        if input_line.sale_type is null or input_line.sale_type not in ('product', 'service') then
            raise exception 'Cada línea debe ser producto o servicio.' using errcode = '22023';
        end if;
        if input_line.quantity is null or input_line.quantity < 1 or input_line.quantity > 99999 then
            raise exception 'La cantidad de cada línea debe estar entre 1 y 99999.' using errcode = '22023';
        end if;
        if input_line.amount is null or input_line.amount <= 0 then
            raise exception 'El monto de cada línea debe ser mayor que cero.' using errcode = '22023';
        end if;
        if input_line.sale_type = 'product' and (input_line.product_id is null or input_line.service_id is not null) then
            raise exception 'Selecciona un producto válido.' using errcode = '22023';
        elsif input_line.sale_type = 'service' and (input_line.service_id is null or input_line.product_id is not null) then
            raise exception 'Selecciona un servicio válido.' using errcode = '22023';
        end if;
        if clean_currency = 'COP' then
            if input_line.amount > 999999999999.99 or input_line.amount <> trunc(input_line.amount) then
                raise exception 'El monto COP de cada línea debe ser un número entero válido.' using errcode = '22023';
            end if;
        elsif input_line.amount > 999999.99 then
            raise exception 'El precio unitario en USD no puede superar 999999.99.' using errcode = '22023';
        end if;
        if input_line.sale_type = 'service' then
            select * into service_value from public.local_sale_services
            where id = input_line.service_id and is_active;
            if not found then raise exception 'El servicio seleccionado no existe o está inactivo.' using errcode = 'P0002'; end if;
        end if;
    end loop;

    -- Lock product rows consistently; services never touch inventory.
    for inventory_total in
        select btrim(line.product_id) product_id, sum(line.quantity)::integer quantity
        from jsonb_to_recordset(p_items) as line(sale_type text, product_id text, service_id uuid, quantity integer, amount numeric)
        where line.sale_type = 'product' group by btrim(line.product_id) order by btrim(line.product_id)
    loop
        select * into target_product from public.product_inventory
        where product_id = inventory_total.product_id and is_active for update;
        if not found then raise exception 'El producto % no existe o está archivado.', inventory_total.product_id using errcode = 'P0002'; end if;
        if target_product.stock < inventory_total.quantity then
            raise exception 'Stock insuficiente para %: disponibles %, solicitadas %.', target_product.product_name, target_product.stock, inventory_total.quantity using errcode = 'P0001';
        end if;
    end loop;
    perform set_config('app.stock_change_source', 'Venta local ' || batch_value::text, true);
    for inventory_total in
        select btrim(line.product_id) product_id, sum(line.quantity)::integer quantity
        from jsonb_to_recordset(p_items) as line(sale_type text, product_id text, service_id uuid, quantity integer, amount numeric)
        where line.sale_type = 'product' group by btrim(line.product_id) order by btrim(line.product_id)
    loop
        update public.product_inventory set stock = stock - inventory_total.quantity, updated_at = now()
        where product_id = inventory_total.product_id;
    end loop;

    insert into public.local_sales (
        batch_id, sale_type, product_id, service_id, product_name, quantity, unit,
        unit_price_usd, total_usd, currency, total_amount, exchange_rate, sold_on, created_by
    )
    select batch_value, line.sale_type,
        case when line.sale_type = 'product' then product.product_id end,
        case when line.sale_type = 'service' then service.id end,
        case when line.sale_type = 'product' then product.product_name else service.name end,
        line.quantity, case when line.sale_type = 'product' then product.unit else service.unit end,
        case when clean_currency = 'COP' then null else round(line.amount, 2) end,
        case when clean_currency = 'COP' then null else round(round(line.amount, 2) * line.quantity, 2) end,
        clean_currency,
        case when clean_currency = 'COP' then round(line.amount, 2)
             when clean_currency = 'USD' then round(round(line.amount, 2) * line.quantity, 2)
             else round(round(line.amount, 2) * line.quantity * saved_exchange_rate, 2) end,
        case when clean_currency = 'VES' then saved_exchange_rate end,
        p_sold_on, auth.uid()
    from jsonb_to_recordset(p_items) as line(sale_type text, product_id text, service_id uuid, quantity integer, amount numeric)
    left join public.product_inventory product on line.sale_type = 'product' and product.product_id = btrim(line.product_id)
    left join public.local_sale_services service on line.sale_type = 'service' and service.id = line.service_id;

    select coalesce(sum(sale.total_amount), 0), jsonb_agg(jsonb_build_object(
        'id', sale.id, 'sale_type', sale.sale_type, 'product_id', sale.product_id,
        'service_id', sale.service_id, 'product_name', sale.product_name, 'quantity', sale.quantity,
        'unit', sale.unit, 'currency', sale.currency, 'unit_price_usd', sale.unit_price_usd,
        'total_amount', sale.total_amount, 'exchange_rate', sale.exchange_rate,
        'remaining_stock', product.stock
    ) order by sale.created_at, sale.id)
    into sale_total, result_sales from public.local_sales sale
    left join public.product_inventory product on product.product_id = sale.product_id
    where sale.batch_id = batch_value;
    return jsonb_build_object('batch_id', batch_value, 'currency', clean_currency,
        'exchange_rate', saved_exchange_rate, 'line_count', item_count,
        'total_amount', sale_total, 'sales', result_sales);
end;
$$;
revoke all on function public.admin_record_local_product_sales(jsonb, text, numeric, date) from public, anon;
grant execute on function public.admin_record_local_product_sales(jsonb, text, numeric, date) to authenticated;

drop function if exists public.admin_list_local_sales(integer);
create function public.admin_list_local_sales(p_limit integer default 200)
returns table (id uuid, batch_id uuid, sale_type text, product_id text, service_id uuid,
    product_name text, quantity integer, unit text, unit_price_usd numeric, total_usd numeric,
    currency text, total_amount numeric, exchange_rate numeric, sold_on date, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar ventas locales.' using errcode = '42501';
    end if;
    return query select sale.id, sale.batch_id, sale.sale_type, sale.product_id, sale.service_id,
        sale.product_name, sale.quantity, sale.unit, sale.unit_price_usd, sale.total_usd,
        sale.currency, sale.total_amount, sale.exchange_rate, sale.sold_on, sale.created_at
    from public.local_sales sale order by sale.sold_on desc, sale.created_at desc, sale.id desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;
revoke all on function public.admin_list_local_sales(integer) from public, anon;
grant execute on function public.admin_list_local_sales(integer) to authenticated;

drop function if exists public.admin_export_local_sales(date, date);
create function public.admin_export_local_sales(p_from date, p_through date)
returns table (id uuid, batch_id uuid, sale_type text, sold_on date, created_at timestamptz,
    product_name text, quantity integer, unit text, currency text, unit_price_usd numeric,
    total_usd numeric, total_amount numeric, exchange_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para exportar ventas locales.' using errcode = '42501';
    end if;
    if p_from is null or p_through is null or p_from > p_through or p_through > current_date or p_through - p_from > 3660 then
        raise exception 'El período de exportación no es válido.' using errcode = '22023';
    end if;
    return query select sale.id, sale.batch_id, sale.sale_type, sale.sold_on, sale.created_at,
        sale.product_name, sale.quantity, sale.unit, sale.currency, sale.unit_price_usd,
        sale.total_usd, sale.total_amount, sale.exchange_rate
    from public.local_sales sale where sale.sold_on between p_from and p_through
    order by sale.sold_on, sale.created_at, sale.id;
end;
$$;
revoke all on function public.admin_export_local_sales(date, date) from public, anon;
grant execute on function public.admin_export_local_sales(date, date) to authenticated;

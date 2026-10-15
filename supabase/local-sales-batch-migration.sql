-- Allow a single local sale to contain multiple products.
-- Run after local-sales-currency-migration.sql.

alter table public.local_sales
    add column if not exists batch_id uuid;

create index if not exists local_sales_batch_id_idx
    on public.local_sales (batch_id, created_at desc)
    where batch_id is not null;

create or replace function public.admin_record_local_product_sales(
    p_items jsonb,
    p_currency text,
    p_exchange_rate numeric,
    p_sold_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    batch_value uuid := gen_random_uuid();
    clean_currency text := upper(btrim(p_currency));
    saved_exchange_rate numeric(18, 6);
    input_line record;
    inventory_total record;
    target_product public.product_inventory%rowtype;
    item_count integer;
    sale_total numeric;
    result_sales jsonb;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar ventas locales.' using errcode = '42501';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'Agrega una lista valida de productos.' using errcode = '22023';
    end if;
    item_count := jsonb_array_length(p_items);
    if item_count < 1 or item_count > 30 then
        raise exception 'La venta debe tener entre 1 y 30 productos.' using errcode = '22023';
    end if;
    if clean_currency is null or clean_currency not in ('USD', 'VES', 'COP') then
        raise exception 'La moneda debe ser USD, VES o COP.' using errcode = '22023';
    end if;
    if p_sold_on is null or p_sold_on > current_date then
        raise exception 'La fecha de venta no puede estar vacia ni en el futuro.' using errcode = '22023';
    end if;
    if clean_currency = 'VES' then
        if p_exchange_rate is null or p_exchange_rate <= 0 or p_exchange_rate > 1000000000 then
            raise exception 'No hay una tasa USD/VES valida para esta venta.' using errcode = '22023';
        end if;
        saved_exchange_rate := round(p_exchange_rate, 6);
    else
        saved_exchange_rate := null;
    end if;

    for input_line in
        select line.product_id, line.quantity, line.amount
        from jsonb_to_recordset(p_items) as line(product_id text, quantity integer, amount numeric)
    loop
        if input_line.product_id is null or btrim(input_line.product_id) = '' then
            raise exception 'Cada linea debe tener un producto valido.' using errcode = '22023';
        end if;
        if input_line.quantity is null or input_line.quantity < 1 or input_line.quantity > 99999 then
            raise exception 'La cantidad de cada producto debe estar entre 1 y 99999.' using errcode = '22023';
        end if;
        if input_line.amount is null or input_line.amount <= 0 then
            raise exception 'El monto de cada producto debe ser mayor que cero.' using errcode = '22023';
        end if;
        if clean_currency = 'COP' then
            if input_line.amount > 999999999999.99 or input_line.amount <> trunc(input_line.amount) then
                raise exception 'El total COP de cada producto debe ser un numero entero valido.' using errcode = '22023';
            end if;
        elsif input_line.amount > 999999.99 then
            raise exception 'El precio unitario en USD no puede superar 999999.99.' using errcode = '22023';
        end if;
    end loop;

    -- Lock each product in a consistent order and validate aggregate quantities first.
    for inventory_total in
        select btrim(line.product_id) as product_id, sum(line.quantity)::integer as quantity
        from jsonb_to_recordset(p_items) as line(product_id text, quantity integer, amount numeric)
        group by btrim(line.product_id)
        order by btrim(line.product_id)
    loop
        select * into target_product
        from public.product_inventory
        where product_id = btrim(inventory_total.product_id) and is_active = true
        for update;

        if not found then
            raise exception 'El producto % no existe o esta archivado.', inventory_total.product_id
                using errcode = 'P0002';
        end if;
        if target_product.stock < inventory_total.quantity then
            raise exception 'Stock insuficiente para %: disponibles %, solicitadas %.',
                target_product.product_name, target_product.stock, inventory_total.quantity
                using errcode = 'P0001';
        end if;
    end loop;

    -- Stock changes and sale rows commit or roll back together.
    perform set_config('app.stock_change_source', 'Venta local ' || batch_value::text, true);
    for inventory_total in
        select btrim(line.product_id) as product_id, sum(line.quantity)::integer as quantity
        from jsonb_to_recordset(p_items) as line(product_id text, quantity integer, amount numeric)
        group by btrim(line.product_id)
        order by btrim(line.product_id)
    loop
        update public.product_inventory
        set stock = stock - inventory_total.quantity, updated_at = now()
        where product_id = btrim(inventory_total.product_id);
    end loop;

    insert into public.local_sales (
        batch_id, sale_type, product_id, product_name, quantity, unit,
        unit_price_usd, total_usd, currency, total_amount, exchange_rate,
        sold_on, created_by
    )
    select batch_value, 'product', product.product_id, product.product_name,
           line.quantity, product.unit,
           case when clean_currency = 'COP' then null else round(line.amount, 2) end,
           case when clean_currency = 'COP' then null else round(round(line.amount, 2) * line.quantity, 2) end,
           clean_currency,
           case
               when clean_currency = 'COP' then round(line.amount, 2)
               when clean_currency = 'USD' then round(round(line.amount, 2) * line.quantity, 2)
               else round(round(line.amount, 2) * line.quantity * saved_exchange_rate, 2)
           end,
           case when clean_currency = 'VES' then saved_exchange_rate else null end,
           p_sold_on, auth.uid()
    from jsonb_to_recordset(p_items) as line(product_id text, quantity integer, amount numeric)
    join public.product_inventory product on product.product_id = btrim(line.product_id);

    select coalesce(sum(sale.total_amount), 0),
           jsonb_agg(jsonb_build_object(
               'id', sale.id,
               'product_id', sale.product_id,
               'product_name', sale.product_name,
               'quantity', sale.quantity,
               'unit', sale.unit,
               'currency', sale.currency,
               'unit_price_usd', sale.unit_price_usd,
               'total_amount', sale.total_amount,
               'exchange_rate', sale.exchange_rate,
               'remaining_stock', product.stock
           ) order by sale.created_at, sale.id)
    into sale_total, result_sales
    from public.local_sales sale
    join public.product_inventory product on product.product_id = sale.product_id
    where sale.batch_id = batch_value;

    return jsonb_build_object(
        'batch_id', batch_value,
        'currency', clean_currency,
        'exchange_rate', saved_exchange_rate,
        'line_count', item_count,
        'total_amount', sale_total,
        'sales', result_sales
    );
end;
$$;

revoke all on function public.admin_record_local_product_sales(jsonb, text, numeric, date) from public, anon;
grant execute on function public.admin_record_local_product_sales(jsonb, text, numeric, date) to authenticated;

-- Include batch identifiers so the panel can show each multi-product sale together.
drop function if exists public.admin_list_local_sales(integer);
create function public.admin_list_local_sales(p_limit integer default 200)
returns table (
    id uuid,
    batch_id uuid,
    sale_type text,
    product_id text,
    product_name text,
    quantity integer,
    unit text,
    unit_price_usd numeric,
    total_usd numeric,
    currency text,
    total_amount numeric,
    exchange_rate numeric,
    sold_on date,
    created_at timestamptz
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
    select sale.id, sale.batch_id, sale.sale_type, sale.product_id, sale.product_name,
           sale.quantity, sale.unit, sale.unit_price_usd, sale.total_usd,
           sale.currency, sale.total_amount, sale.exchange_rate,
           sale.sold_on, sale.created_at
    from public.local_sales sale
    order by sale.sold_on desc, sale.created_at desc, sale.id desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.admin_list_local_sales(integer) from public, anon;
grant execute on function public.admin_list_local_sales(integer) to authenticated;

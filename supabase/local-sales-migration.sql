-- Registro de ventas locales de productos con descuento atomico del inventario.
-- Ejecutar despues de inventory-migration.sql, product-catalog-migration.sql
-- product-archive-migration.sql y stock-history-migration.sql.

create table if not exists public.local_sales (
    id uuid primary key default gen_random_uuid(),
    sale_type text not null default 'product' check (sale_type in ('product', 'service')),
    product_id text references public.product_inventory(product_id) on delete set null,
    product_name text not null,
    quantity integer not null check (quantity > 0 and quantity <= 99999),
    unit text not null check (unit in ('unidad', 'metro')),
    unit_price_usd numeric(12, 2) not null check (unit_price_usd > 0),
    total_usd numeric(12, 2) not null check (total_usd > 0),
    sold_on date not null default current_date,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint local_sales_product_required check (
        (sale_type = 'product' and product_id is not null)
        or (sale_type = 'service' and product_id is null)
    )
);

create index if not exists local_sales_sold_on_created_at_idx
    on public.local_sales (sold_on desc, created_at desc);
create index if not exists local_sales_product_id_idx
    on public.local_sales (product_id, sold_on desc);

alter table public.local_sales enable row level security;
revoke all on public.local_sales from public, anon, authenticated;

create or replace function public.admin_record_local_product_sale(
    p_product_id text,
    p_quantity integer,
    p_unit_price_usd numeric,
    p_sold_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_product public.product_inventory%rowtype;
    sale_id uuid := gen_random_uuid();
    rounded_price numeric(12, 2);
    remaining_stock integer;
    sale_total numeric(12, 2);
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar ventas locales.' using errcode = '42501';
    end if;
    if p_product_id is null or btrim(p_product_id) = '' then
        raise exception 'Selecciona un producto valido.' using errcode = '22023';
    end if;
    if p_quantity is null or p_quantity < 1 or p_quantity > 99999 then
        raise exception 'La cantidad debe estar entre 1 y 99999.' using errcode = '22023';
    end if;
    if p_unit_price_usd is null or round(p_unit_price_usd, 2) <= 0 or p_unit_price_usd > 999999.99 then
        raise exception 'El precio debe ser mayor que cero y no superar 999999.99 USD.' using errcode = '22023';
    end if;
    if p_sold_on is null or p_sold_on > current_date then
        raise exception 'La fecha de venta no puede estar vacia ni en el futuro.' using errcode = '22023';
    end if;

    select * into target_product
    from public.product_inventory
    where product_id = btrim(p_product_id) and is_active = true
    for update;

    if not found then
        raise exception 'El producto no existe o esta archivado.' using errcode = 'P0002';
    end if;
    if target_product.stock < p_quantity then
        raise exception 'Stock insuficiente para %: disponibles %, solicitadas %.',
            target_product.product_name, target_product.stock, p_quantity
            using errcode = 'P0001';
    end if;

    rounded_price := round(p_unit_price_usd, 2);
    sale_total := round(rounded_price * p_quantity, 2);
    remaining_stock := target_product.stock - p_quantity;

    perform set_config('app.stock_change_source', 'Venta local ' || sale_id::text, true);
    update public.product_inventory
    set stock = remaining_stock, updated_at = now()
    where product_id = target_product.product_id;

    insert into public.local_sales (
        id, sale_type, product_id, product_name, quantity, unit,
        unit_price_usd, total_usd, sold_on, created_by
    ) values (
        sale_id, 'product', target_product.product_id, target_product.product_name,
        p_quantity, target_product.unit, rounded_price, sale_total, p_sold_on, auth.uid()
    );

    return jsonb_build_object(
        'id', sale_id,
        'sale_type', 'product',
        'product_id', target_product.product_id,
        'product_name', target_product.product_name,
        'quantity', p_quantity,
        'unit', target_product.unit,
        'unit_price_usd', rounded_price,
        'total_usd', sale_total,
        'sold_on', p_sold_on,
        'remaining_stock', remaining_stock
    );
end;
$$;

revoke all on function public.admin_record_local_product_sale(text, integer, numeric, date) from public, anon;
grant execute on function public.admin_record_local_product_sale(text, integer, numeric, date) to authenticated;

create or replace function public.admin_list_local_sales(p_limit integer default 200)
returns table (
    id uuid,
    sale_type text,
    product_id text,
    product_name text,
    quantity integer,
    unit text,
    unit_price_usd numeric,
    total_usd numeric,
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
    select sale.id, sale.sale_type, sale.product_id, sale.product_name,
           sale.quantity, sale.unit, sale.unit_price_usd, sale.total_usd,
           sale.sold_on, sale.created_at
    from public.local_sales sale
    order by sale.sold_on desc, sale.created_at desc, sale.id desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.admin_list_local_sales(integer) from public, anon;
grant execute on function public.admin_list_local_sales(integer) to authenticated;

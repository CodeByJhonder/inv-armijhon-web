-- Agrega un minimo de reposicion configurable para cada producto.
-- Ejecutar en Supabase SQL Editor despues de inventory-migration.sql.

alter table public.product_inventory
    add column if not exists min_stock integer not null default 5;

alter table public.product_inventory
    drop constraint if exists product_inventory_min_stock_check;

alter table public.product_inventory
    add constraint product_inventory_min_stock_check
    check (min_stock >= 0 and min_stock <= 99999);

create or replace function public.admin_set_product_min_stock(p_product_id text, p_min_stock integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    updated_min_stock integer;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para modificar el inventario.'
            using errcode = '42501';
    end if;
    if p_min_stock is null or p_min_stock < 0 or p_min_stock > 99999 then
        raise exception 'El minimo debe estar entre 0 y 99999.'
            using errcode = '22023';
    end if;

    update public.product_inventory
    set min_stock = p_min_stock, updated_at = now()
    where product_id = p_product_id
    returning min_stock into updated_min_stock;

    if not found then
        raise exception 'El producto no existe en el inventario.'
            using errcode = 'P0002';
    end if;
    return updated_min_stock;
end;
$$;

revoke all on function public.admin_set_product_min_stock(text, integer) from public, anon;
grant execute on function public.admin_set_product_min_stock(text, integer) to authenticated;

-- Hide products from the active inventory and public catalog without removing
-- their references from historical order and stock records.
-- Run after product-catalog-migration.sql.

alter table public.product_inventory
    add column if not exists is_active boolean not null default true;

create or replace function public.admin_archive_inventory_product(p_product_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    archived_product_name text;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para eliminar productos.' using errcode = '42501';
    end if;
    if p_product_id is null or btrim(p_product_id) = '' then
        raise exception 'El producto indicado no es válido.' using errcode = '22023';
    end if;

    update public.product_inventory
    set is_active = false, updated_at = now()
    where product_id = p_product_id and is_active = true
    returning product_name into archived_product_name;

    if not found then
        select product_name into archived_product_name
        from public.product_inventory
        where product_id = p_product_id;
        if not found then
            raise exception 'El producto no existe.' using errcode = 'P0002';
        end if;
    end if;

    return jsonb_build_object(
        'product_id', p_product_id,
        'product_name', archived_product_name,
        'is_active', false
    );
end;
$$;

revoke all on function public.admin_archive_inventory_product(text) from public, anon;
grant execute on function public.admin_archive_inventory_product(text) to authenticated;

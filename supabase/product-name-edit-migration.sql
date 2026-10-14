-- Allow administrators to rename active inventory products from the admin panel.
-- Run after product-catalog-migration.sql and product-archive-migration.sql.

create or replace function public.admin_rename_inventory_product(
    p_product_id text,
    p_product_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_name text := nullif(btrim(p_product_name), '');
    updated_product record;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para cambiar nombres de productos.' using errcode = '42501';
    end if;
    if p_product_id is null or btrim(p_product_id) = '' then
        raise exception 'El producto indicado no es válido.' using errcode = '22023';
    end if;
    if clean_name is null or char_length(clean_name) > 120 then
        raise exception 'El nombre es obligatorio y debe tener máximo 120 caracteres.' using errcode = '22023';
    end if;

    update public.product_inventory
    set product_name = clean_name,
        updated_at = now()
    where product_id = btrim(p_product_id)
      and is_active = true
    returning product_id, product_name into updated_product;

    if not found then
        raise exception 'El producto no existe o ya no está activo.' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'product_id', updated_product.product_id,
        'product_name', updated_product.product_name
    );
end;
$$;

revoke all on function public.admin_rename_inventory_product(text, text) from public, anon;
grant execute on function public.admin_rename_inventory_product(text, text) to authenticated;
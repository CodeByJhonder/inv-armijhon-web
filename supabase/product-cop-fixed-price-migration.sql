-- Add a fixed Colombian peso price per inventory product.
-- Run after catalog-product-details-migration.sql.

alter table public.product_inventory
    add column if not exists price_cop numeric(14, 2);

alter table public.product_inventory
    drop constraint if exists product_inventory_price_cop_check;

alter table public.product_inventory
    add constraint product_inventory_price_cop_check
    check (price_cop is null or (price_cop > 0 and price_cop = trunc(price_cop)));

-- The new parameter stores COP independently; USD still controls catalog availability.
drop function if exists public.admin_update_inventory_catalog_details(text, numeric, text);

create function public.admin_update_inventory_catalog_details(
    p_product_id text,
    p_price_usd numeric,
    p_price_cop numeric,
    p_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_image_url text := nullif(btrim(p_image_url), '');
    updated_product public.product_inventory%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para actualizar productos.' using errcode = '42501';
    end if;
    if p_product_id is null or btrim(p_product_id) = '' then
        raise exception 'El producto indicado no es válido.' using errcode = '22023';
    end if;
    if p_price_usd is not null and (
        round(p_price_usd, 2) <= 0 or p_price_usd > 999999.99
    ) then
        raise exception 'El precio debe ser mayor que cero y no superar 999999.99 USD.' using errcode = '22023';
    end if;
    if p_price_cop is not null and (
        p_price_cop <= 0 or p_price_cop > 999999999999 or p_price_cop <> trunc(p_price_cop)
    ) then
        raise exception 'El precio COP debe ser un entero entre 1 y 999999999999.' using errcode = '22023';
    end if;
    if clean_image_url is not null and (
        char_length(clean_image_url) > 1000
        or clean_image_url ~ '[[:cntrl:]]'
        or position(chr(92) in clean_image_url) > 0
        or clean_image_url like '//%'
        or clean_image_url ~ '(^|/)[.][.](/|$)'
        or (
            clean_image_url !~* '^https://'
            and clean_image_url ~ '^[a-z][a-z0-9+.-]*:'
        )
    ) then
        raise exception 'La imagen debe usar una ruta del sitio o una URL https:// válida.' using errcode = '22023';
    end if;

    update public.product_inventory
    set price_usd = case when p_price_usd is null then null else round(p_price_usd, 2) end,
        price_cop = p_price_cop,
        image_url = clean_image_url,
        coming_soon = p_price_usd is null,
        updated_at = now()
    where product_id = btrim(p_product_id)
      and is_active = true
    returning * into updated_product;

    if not found then
        raise exception 'El producto no existe o ya no está activo.' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'product_id', updated_product.product_id,
        'product_name', updated_product.product_name,
        'price_usd', updated_product.price_usd,
        'price_cop', updated_product.price_cop,
        'image_url', updated_product.image_url,
        'coming_soon', updated_product.coming_soon
    );
end;
$$;

revoke all on function public.admin_update_inventory_catalog_details(text, numeric, numeric, text) from public, anon;
grant execute on function public.admin_update_inventory_catalog_details(text, numeric, numeric, text) to authenticated;

-- Allow catalog products to be created without a price and completed later
-- from the admin inventory panel. Run after product-catalog-migration.sql.

create or replace function public.admin_add_inventory_product_with_image(
    p_name text,
    p_category text,
    p_price_usd numeric,
    p_description text,
    p_unit text,
    p_stock integer,
    p_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_name text := nullif(btrim(p_name), '');
    clean_category text := nullif(btrim(p_category), '');
    clean_description text := nullif(btrim(p_description), '');
    clean_image_url text := nullif(btrim(p_image_url), '');
    category_slug_value text;
    category_slug_base text;
    product_id_value text;
    suffix integer := 2;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar productos.' using errcode = '42501';
    end if;
    if clean_name is null or char_length(clean_name) > 120 then
        raise exception 'El nombre es obligatorio y debe tener máximo 120 caracteres.' using errcode = '22023';
    end if;
    if clean_category is null or char_length(clean_category) > 60 then
        raise exception 'Selecciona o escribe una categoría de máximo 60 caracteres.' using errcode = '22023';
    end if;
    if p_price_usd is not null and (
        round(p_price_usd, 2) <= 0 or p_price_usd > 999999.99
    ) then
        raise exception 'El precio debe ser mayor que cero y no superar 999999.99 USD.' using errcode = '22023';
    end if;
    if clean_description is null or char_length(clean_description) > 500 then
        raise exception 'La descripción es obligatoria y debe tener máximo 500 caracteres.' using errcode = '22023';
    end if;
    if p_unit is null or p_unit not in ('unidad', 'metro') then
        raise exception 'La unidad debe ser unidad o metro.' using errcode = '22023';
    end if;
    if p_stock is null or p_stock < 0 or p_stock > 99999 then
        raise exception 'Las existencias deben estar entre 0 y 99999.' using errcode = '22023';
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

    select slug into category_slug_value
    from public.product_categories
    where lower(name) = lower(clean_category);

    if category_slug_value is null then
        category_slug_base := trim(both '-' from regexp_replace(
            translate(lower(clean_category), 'áéíóúüñ', 'aeiouun'),
            '[^a-z0-9]+', '-', 'g'
        ));
        if category_slug_base = '' then
            raise exception 'La categoría debe contener letras o números.' using errcode = '22023';
        end if;
        category_slug_value := category_slug_base;
        while exists (
            select 1 from public.product_categories where slug = category_slug_value
        ) loop
            category_slug_value := category_slug_base || '-' || suffix::text;
            suffix := suffix + 1;
        end loop;
        insert into public.product_categories (slug, name)
        values (category_slug_value, clean_category);
    end if;

    product_id_value := 'p' || nextval('public.catalog_product_id_seq')::text;
    insert into public.product_inventory (
        product_id, product_name, stock, category_slug, price_usd,
        description, unit, image_url, coming_soon, updated_at
    ) values (
        product_id_value, clean_name, p_stock, category_slug_value,
        case when p_price_usd is null then null else round(p_price_usd, 2) end,
        clean_description, p_unit, clean_image_url, p_price_usd is null, now()
    );

    return jsonb_build_object(
        'product_id', product_id_value,
        'product_name', clean_name,
        'category_slug', category_slug_value,
        'price_usd', case when p_price_usd is null then null else round(p_price_usd, 2) end,
        'stock', p_stock,
        'unit', p_unit,
        'image_url', clean_image_url,
        'coming_soon', p_price_usd is null
    );
end;
$$;

revoke all on function public.admin_add_inventory_product_with_image(text, text, numeric, text, text, integer, text) from public, anon;
grant execute on function public.admin_add_inventory_product_with_image(text, text, numeric, text, text, integer, text) to authenticated;

create or replace function public.admin_update_inventory_catalog_details(
    p_product_id text,
    p_price_usd numeric,
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
        'image_url', updated_product.image_url,
        'coming_soon', updated_product.coming_soon
    );
end;
$$;

revoke all on function public.admin_update_inventory_catalog_details(text, numeric, text) from public, anon;
grant execute on function public.admin_update_inventory_catalog_details(text, numeric, text) to authenticated;

-- Store catalog product photos in a public Supabase Storage bucket.
-- Run after product-catalog-migration.sql and catalog-product-details-migration.sql.
-- Existing images remain in the repository until the admin panel migrates them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp']::text[])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can read product image objects" on storage.objects;
create policy "Admins can read product image objects"
on storage.objects for select to authenticated
using (bucket_id = 'product-images' and public.is_chat_admin());

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.is_chat_admin());

drop policy if exists "Admins can replace product images" on storage.objects;
create policy "Admins can replace product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.is_chat_admin())
with check (bucket_id = 'product-images' and public.is_chat_admin());

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.is_chat_admin());

create or replace function public.admin_set_inventory_product_image(
    p_product_id text,
    p_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_image_url text := nullif(btrim(p_image_url), '');
    updated_product record;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para cambiar imagenes de productos.' using errcode = '42501';
    end if;
    if p_product_id is null or btrim(p_product_id) = '' then
        raise exception 'El producto indicado no es valido.' using errcode = '22023';
    end if;
    if clean_image_url is null or char_length(clean_image_url) > 1000
       or clean_image_url !~* '^https://'
       or position('/storage/v1/object/public/product-images/' in clean_image_url) = 0
       or clean_image_url ~ '[[:cntrl:]]' then
        raise exception 'La imagen debe estar guardada en el almacenamiento del catalogo.' using errcode = '22023';
    end if;

    update public.product_inventory
    set image_url = clean_image_url, updated_at = now()
    where product_id = btrim(p_product_id) and is_active = true
    returning product_id, product_name, image_url into updated_product;

    if not found then
        raise exception 'El producto no existe o ya no esta activo.' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'product_id', updated_product.product_id,
        'product_name', updated_product.product_name,
        'image_url', updated_product.image_url
    );
end;
$$;

revoke all on function public.admin_set_inventory_product_image(text, text) from public, anon;
grant execute on function public.admin_set_inventory_product_image(text, text) to authenticated;

-- Make the inventory table the live, public catalog source.
-- Run after inventory-migration.sql, inventory-add-p48.sql when needed,
-- stock-alerts-migration.sql, and chat-migration.sql.

create table if not exists public.product_categories (
    slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name text not null,
    created_at timestamptz not null default now()
);

create unique index if not exists product_categories_name_ci_idx
    on public.product_categories (lower(name));

insert into public.product_categories (slug, name)
values
    ('escolares', 'Papelería y Útiles'),
    ('lubricantes', 'Lubricantes'),
    ('cuidado', 'Cuidado Personal'),
    ('limpieza', 'Limpieza')
on conflict (slug) do update set name = excluded.name;

alter table public.product_inventory
    add column if not exists category_slug text,
    add column if not exists price_usd numeric(12, 2),
    add column if not exists description text,
    add column if not exists unit text not null default 'unidad',
    add column if not exists image_url text,
    add column if not exists coming_soon boolean not null default false;

alter table public.order_items
    add column if not exists unit text not null default 'unidad';
alter table public.order_items
    drop constraint if exists order_items_unit_check;
alter table public.order_items
    add constraint order_items_unit_check check (unit in ('unidad', 'metro'));

alter table public.product_inventory
    drop constraint if exists product_inventory_unit_check;
alter table public.product_inventory
    add constraint product_inventory_unit_check check (unit in ('unidad', 'metro'));
alter table public.product_inventory
    drop constraint if exists product_inventory_price_usd_check;
alter table public.product_inventory
    add constraint product_inventory_price_usd_check check (price_usd is null or price_usd > 0);

insert into public.product_inventory (product_id, product_name, stock, category_slug, price_usd, description, unit, image_url, coming_soon)
values
    ('p1', 'FC Semisintético SAE 15W-40', 0, 'lubricantes', 11.28, 'Aceite semisintético para vehículos, presentación de 946 ml.', 'unidad', 'img/fc-semisintetico-sae-15w-40.jpeg', false),
    ('p2', 'FC Aceite Mineral 20W-50', 0, 'lubricantes', 9.66, 'Aceite mineral para motor, presentación de 946 ml.', 'unidad', 'img/fc-aceite-mineral-20w-50.jpeg', false),
    ('p3', 'Mobil Super 15W50 Moto 4T MX', 0, 'lubricantes', 11.28, 'Aceite para motos de cuatro tiempos, presentación de 1 L.', 'unidad', 'img/mobil-super-15w50-moto-4t-mx.jpeg', false),
    ('p4', 'Marcador Sharpie Punta Fina Permanente Azul', 0, 'escolares', 1.18, 'Marcador permanente de punta fina, tinta azul.', 'unidad', 'img/Marcador Sharpy Punta Fina Permanente AZUL.png', false),
    ('p5', 'Gel de Árnica Sunt Life', 0, 'cuidado', 10.00, 'Gel de árnica para uso corporal.', 'unidad', 'img/ARNICA gel de arnica sunt life.jpg', false),
    ('p6', 'FC API GL-1 Sincrónica 140', 0, 'lubricantes', 9.99, 'Aceite de transmisión sincrónica 140, presentación de 946 ml.', 'unidad', 'https://images.unsplash.com/photo-1635437536607-b8572f443763?auto=format&fit=crop&w=500&q=60', false),
    ('p7', 'Silicón Líquido Pointer 30ml', 0, 'escolares', 0.97, 'Silicón líquido escolar, presentación de 30 ml.', 'unidad', 'img/Silicon Liquido Pointer 30ML.png', false),
    ('p8', 'Desodorante Ideal Roll-On 50g', 0, 'cuidado', 4.51, 'Desodorante antitranspirante roll-on.', 'unidad', 'img/desodorante y antitranspirante ideal roll-on 50g.webp', false),
    ('p9', 'Marcador Sharpie Punta Media Azul', 0, 'escolares', 1.18, 'Marcador permanente de punta media, tinta azul.', 'unidad', 'img/Marcador Sharpy Punta Media Permanente AZUL.jpg', false),
    ('p10', 'Bolígrafo Semi Gel Offi-Esco Azul', 0, 'escolares', 0.48, 'Bolígrafo de punta fina, tinta azul.', 'unidad', 'img/BOLIGRAFO SEMI GEL PUNTA FINA AZUL OFFI-ESCO.jpg', false),
    ('p11', 'Marcador Ofica Punta Media Azul', 0, 'escolares', 0.97, 'Marcador permanente de punta media.', 'unidad', 'img/Marcador OFICA PUNTA MEDIA AZUL Permanente.jpg', false),
    ('p12', 'Silicón Líquido Penmax 30ml', 0, 'escolares', 0.97, 'Silicón líquido escolar, presentación de 30 ml.', 'unidad', 'img/Silicon liquido Penmax 30ml.webp', false),
    ('p13', 'Pega Blanca Líquida 40ml', 0, 'escolares', 0.81, 'Pega blanca líquida escolar, 40 ml.', 'unidad', 'img/Pega Blanca Liquida White craft glue 40ml.png', false),
    ('p14', 'Marcador Sharpie Punta Fina Rojo', 0, 'escolares', 1.18, 'Marcador permanente de punta fina, tinta roja.', 'unidad', 'img/Marcador Sharpy Punta Fina Rojo.png', false),
    ('p15', 'FC Semisintético SAE 20W-50', 0, 'lubricantes', 11.28, 'Aceite semisintético para vehículos, presentación de 946 ml.', 'unidad', 'https://images.unsplash.com/photo-1635437536607-b8572f443763?auto=format&fit=crop&w=500&q=60', false),
    ('p16', 'Lápiz de Crayón HB Pointer', 0, 'escolares', 0.32, 'Lápiz de crayón HB para uso escolar.', 'unidad', 'img/Lapiz de crayon HB Pointer.webp', false),
    ('p17', 'Pega en Barra Marfil 10g', 0, 'escolares', 0.64, 'Pega en barra, presentación de 10 gramos.', 'unidad', 'img/Pega en barra MARFIL 10g.webp', false),
    ('p18', 'Limpiador de Vidrios Dura Wash 500ml', 0, 'limpieza', 4.83, 'Limpiador de vidrios, presentación de 500 ml.', 'unidad', 'img/limpiador dura wash limpiador de vidros 500ml.png', false),
    ('p19', 'Juego de Compás Escolar', 0, 'escolares', 1.61, 'Set de compás para geometría escolar.', 'unidad', 'img/COMPASSES SET JUEGO DE COMPAS.png', false),
    ('p20', 'Resaltador Sharpie Accent 3D Amarillo', 0, 'escolares', 1.18, 'Resaltador de tinta amarilla.', 'unidad', 'img/RESALTADOR AMARILLO SHARPY ACCENT3D.jpg', false),
    ('p21', 'Tijera Escolar', 0, 'escolares', 0.64, 'Tijera de uso escolar.', 'unidad', 'img/TIJERA ESCOLAR.jpg', false),
    ('p22', 'Block Milimetrado N&G', 0, 'escolares', 0.64, 'Block de papel milimetrado.', 'unidad', 'img/block-milimetrado-ng.png', false),
    ('p23', 'Borrador de Nata Mayka', 0, 'escolares', 0.64, 'Borrador de nata, tamaño estándar.', 'unidad', 'img/borrador-nata-mayka.png', false),
    ('p24', 'Borrador de Nata Mayka Pequeño', 0, 'escolares', 0.32, 'Borrador de nata, tamaño pequeño.', 'unidad', 'img/borrador-nata-mayka-pequeno.png', false),
    ('p25', 'Sacapuntas Fashion Klipp', 0, 'escolares', 0.97, 'Sacapuntas con depósito.', 'unidad', 'img/Sacapunta con deposito fashion klipp.webp', false),
    ('p26', 'Papel Milimetrado', 0, 'escolares', 0.64, 'Hoja de papel milimetrado.', 'unidad', 'img/Papel Milimetrado.png', false),
    ('p27', 'Block Milimetrado Grupo Cinco', 0, 'escolares', 0.64, 'Block de papel milimetrado.', 'unidad', 'img/BLOCK MILIMETRADO GRUPO CINCO.png', false),
    ('p28', 'Bolígrafo Semi Gel Offi-Esco Negro', 0, 'escolares', 0.48, 'Bolígrafo de punta fina, tinta negra.', 'unidad', 'img/BOLIGRAFO SEMI GEL PUNTA FINA NEGRO OFFI-ESCO.webp', false),
    ('p29', 'Cinta Adhesiva Pequeña Celoven', 0, 'escolares', 0.64, 'Cinta adhesiva transparente, tamaño pequeño.', 'unidad', 'img/cinta-adhesiva-pequena-celoven.png', false),
    ('p30', 'Block Rotulado Bond', 0, 'escolares', 0.64, 'Block de papel bond rotulado.', 'unidad', 'img/BLOCK ROTULADO BOND.png', false),
    ('p31', 'Bolígrafo Marfil Negro', 0, 'escolares', 0.48, 'Bolígrafo de tinta negra.', 'unidad', 'img/BOLIGRAFO MARFIL NEGRO.webp', false),
    ('p32', 'Colores Pointer', 0, 'escolares', 2.07, 'Set de colores Pointer para dibujar, colorear y dar vida a tus trabajos escolares.', 'unidad', 'img/colores-pointer.jpg', false),
    ('p33', 'Colores Solita', 0, 'escolares', 4.55, 'Colores Solita ideales para ilustraciones, dibujos y actividades escolares.', 'unidad', 'img/colores-solita.png', false),
    ('p34', 'Pinturas al Frío Black Color', 0, 'escolares', 1.30, 'Pintura al frío para proyectos artísticos, decoraciones y manualidades.', 'unidad', 'img/pinturas-black-color.jpg', false),
    ('p35', 'Celoven 18mm 25m', 0, 'escolares', 1.95, 'Cinta adhesiva transparente Celoven de 18 mm de ancho y 25 m de largo.', 'unidad', 'img/celoven-18mm-25m.webp', false),
    ('p36', 'Pinceles Artist Brushes', 0, 'escolares', 0.44, 'Pinceles para aplicar pintura y realizar trazos en trabajos artísticos.', 'unidad', 'img/artist-brushes.webp', false),
    ('p37', 'Lápices Pointer con Agarre Suave', 0, 'escolares', 0.43, 'Lápices de madera HB N.º 2 con agarre suave, ideales para escribir, dibujar y realizar tareas escolares.', 'unidad', 'img/lapices-pointer-agarre-suave.webp', false),
    ('p38', 'Crema Corporal Ideal+ Citrus Fresh', 2, 'cuidado', 10.00, 'Crema corporal Ideal+ Citrus Fresh con una fragancia cítrica y fresca para dejar tu piel suave y perfumada.', 'unidad', 'img/crema-corporal-ideal-citrus-fresh.jpg', false),
    ('p39', 'Borrador de Pizarra XMK', 0, 'escolares', 0.62, 'Borrador XMK para limpiar pizarras blancas y retirar trazos de marcador de forma práctica.', 'unidad', 'img/borrador-pizarra-xmk.webp', false),
    ('p40', 'Láminas de Papel Bond', 0, 'escolares', 0.60, 'Láminas de papel bond ideales para impresiones, tareas, dibujos y actividades escolares.', 'unidad', 'img/laminas-papel-bond.jpg', false),
    ('p48', 'Hilo de Cola de ratón', 55, 'escolares', 0.63, 'Hilo suave y resistente para manualidades y trabajos escolares. Se vende por metro.', 'metro', 'img/cola-de-raton-55m.webp', false),
    ('p41', 'Carpeta Amarilla', 0, 'escolares', null, 'Carpeta amarilla práctica para organizar documentos y trabajos escolares. Tamaño por confirmar.', 'unidad', 'img/proximamente-carpeta-amarilla.svg', true),
    ('p42', 'Carpeta Marrón', 0, 'escolares', null, 'Carpeta marrón para guardar y proteger hojas y documentos. Tamaño por confirmar.', 'unidad', 'img/proximamente-carpeta-marron.svg', true),
    ('p43', 'Cartulina Tipo Póster', 0, 'escolares', null, 'Cartulina amplia para afiches, exposiciones, proyectos y trabajos creativos.', 'unidad', 'img/proximamente-cartulina-poster.svg', true),
    ('p44', 'Cuadernos Pequeños', 0, 'escolares', null, 'Cuadernos compactos, cómodos para apuntes y actividades escolares.', 'unidad', 'img/proximamente-cuadernos-pequenos.svg', true),
    ('p45', 'Lápiz de Tinta Color Negro', 0, 'escolares', null, 'Lápiz de tinta negra para escribir con claridad en tareas y apuntes.', 'unidad', 'img/proximamente-lapiz-tinta-negro.svg', true),
    ('p46', 'Sobre Manila', 0, 'escolares', null, 'Sobre manila para almacenar y transportar documentos. Tamaño por confirmar.', 'unidad', 'img/proximamente-sobre-manila.svg', true),
    ('p47', 'Hojas de Examen Tamaño Oficio', 0, 'escolares', null, 'Hojas de examen tamaño oficio para evaluaciones, prácticas y actividades escolares.', 'unidad', 'img/proximamente-hojas-examen-oficio.svg', true)
on conflict (product_id) do update set
    product_name = excluded.product_name,
    category_slug = excluded.category_slug,
    price_usd = excluded.price_usd,
    description = excluded.description,
    unit = excluded.unit,
    image_url = excluded.image_url,
    coming_soon = excluded.coming_soon;

alter table public.product_inventory
    drop constraint if exists product_inventory_category_slug_fkey;
alter table public.product_inventory
    add constraint product_inventory_category_slug_fkey
    foreign key (category_slug) references public.product_categories(slug);

alter table public.product_categories enable row level security;
revoke all on public.product_categories from anon, authenticated;
grant select on public.product_categories to anon, authenticated;
drop policy if exists "Anyone can read product categories" on public.product_categories;
create policy "Anyone can read product categories"
on public.product_categories for select to anon, authenticated using (true);

-- Catalog products refresh in open customer pages through Realtime.
do $$
begin
    alter publication supabase_realtime add table public.product_inventory;
exception when duplicate_object then
    null;
end;
$$;

create sequence if not exists public.catalog_product_id_seq start with 49;
select setval(
    'public.catalog_product_id_seq',
    greatest(49, coalesce((select max(substring(product_id from 2)::bigint) + 1
        from public.product_inventory where product_id ~ '^p[0-9]+$'), 49)),
    false
);

create or replace function public.admin_add_inventory_product(
    p_name text,
    p_category text,
    p_price_usd numeric,
    p_description text,
    p_unit text,
    p_stock integer
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
    if p_price_usd is null or round(p_price_usd, 2) <= 0 or p_price_usd > 999999.99 then
        raise exception 'El precio debe ser mayor que cero.' using errcode = '22023';
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
        product_id_value, clean_name, p_stock, category_slug_value, round(p_price_usd, 2),
        clean_description, p_unit, null, false, now()
    );

    return jsonb_build_object(
        'product_id', product_id_value,
        'product_name', clean_name,
        'category_slug', category_slug_value,
        'price_usd', round(p_price_usd, 2),
        'stock', p_stock,
        'unit', p_unit
    );
end;
$$;

revoke all on function public.admin_add_inventory_product(text, text, numeric, text, text, integer) from public, anon;
grant execute on function public.admin_add_inventory_product(text, text, numeric, text, text, integer) to authenticated;



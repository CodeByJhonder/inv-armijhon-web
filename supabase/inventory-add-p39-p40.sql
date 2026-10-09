-- Registrar el inventario inicial de los nuevos productos del catálogo.
-- Ejecutar una vez en Supabase SQL Editor; al reejecutar conserva el stock actual.

insert into public.product_inventory (product_id, product_name, stock)
values
    ('p39', 'Borrador de Pizarra XMK', 0),
    ('p40', 'Láminas de Papel Bond', 0)
on conflict (product_id) do update
set product_name = excluded.product_name;

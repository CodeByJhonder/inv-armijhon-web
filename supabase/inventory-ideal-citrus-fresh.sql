-- Registra Crema Corporal Ideal+ Citrus Fresh con las dos unidades iniciales.
-- Se puede ejecutar de nuevo sin reiniciar el stock si el producto ya existe.

insert into public.product_inventory (product_id, product_name, stock)
values ('p38', 'Crema Corporal Ideal+ Citrus Fresh', 2)
on conflict (product_id) do update
set product_name = excluded.product_name;

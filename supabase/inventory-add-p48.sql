-- Registra los 55 metros disponibles de Hilo de Cola de ratón.
-- Se puede ejecutar de nuevo sin reiniciar el stock si ya fue actualizado.

insert into public.product_inventory (product_id, product_name, stock)
values ('p48', 'Hilo de Cola de ratón', 55)
on conflict (product_id) do update
set product_name = excluded.product_name;

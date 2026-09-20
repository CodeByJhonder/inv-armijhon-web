-- Ejecutar una sola vez en Supabase SQL Editor.
-- Habilita actualizaciones Realtime para que el panel reciba pedidos nuevos.
alter publication supabase_realtime add table public.orders;

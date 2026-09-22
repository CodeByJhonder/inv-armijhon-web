-- Políticas necesarias para las acciones administrativas del panel.
-- Ejecutar en Supabase SQL Editor.
-- Este script puede volver a ejecutarse sin crear políticas duplicadas.

drop policy if exists "authenticated admins can delete orders" on public.orders;
create policy "authenticated admins can delete orders"
on public.orders
for delete
to authenticated
using (true);

drop policy if exists "authenticated admins can delete payment files" on storage.objects;
create policy "authenticated admins can delete payment files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'payment-receipts');

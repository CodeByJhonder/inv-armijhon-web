-- Ejecutar en Supabase SQL Editor para permitir que la Edge Function (service_role)
-- o un administrador autenticado apruebe o rechace pedidos. Ejecutar despues
-- de inventory-migration.sql; se puede volver a ejecutar de forma segura.
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    item record;
    available_stock integer;
    processed_items integer := 0;
    is_service_role boolean;
begin
    if new.status = old.status then
        return new;
    end if;

    -- En funciones SECURITY DEFINER, current_setting('role') puede reflejar
    -- el propietario de la función y no el rol JWT que hizo la solicitud.
    is_service_role := coalesce(auth.role() = 'service_role', false);

    -- Si no es service_role, debe ser un admin autenticado
    if not is_service_role and (auth.uid() is null or not public.is_chat_admin()) then
        raise exception 'No tienes permiso para cambiar el estado de pedidos.'
            using errcode = '42501';
    end if;

    if not (
        (old.status = 'pending' and new.status in ('approved', 'rejected'))
        or (old.status = 'approved' and new.status = 'completed')
    ) then
        raise exception 'El pedido no permite esta transición de estado.'
            using errcode = '22023';
    end if;

    if new.status = 'approved' then
        for item in
            select product_id, product_name, quantity
            from public.order_items
            where order_id = new.id
            order by product_id
        loop
            processed_items := processed_items + 1;
            update public.product_inventory
            set stock = stock - item.quantity, updated_at = now()
            where product_id = item.product_id
              and stock >= item.quantity;

            if not found then
                select stock into available_stock
                from public.product_inventory
                where product_id = item.product_id;

                raise exception 'Stock insuficiente para %: disponibles %, solicitadas %.',
                    item.product_name, coalesce(available_stock, 0), item.quantity
                    using errcode = 'P0001';
            end if;
        end loop;

        if processed_items = 0 then
            raise exception 'El pedido no tiene productos que puedan descontarse.'
                using errcode = '22023';
        end if;
    end if;

    return new;
end;
$$;

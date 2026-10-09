-- Inventario por producto. Ejecutar despues de schema.sql y chat-migration.sql.
-- Todas las existencias comienzan en cero; el administrador las registra en el panel.

create table if not exists public.product_inventory (
    product_id text primary key,
    product_name text not null,
    stock integer not null default 0 check (stock >= 0),
    updated_at timestamptz not null default now()
);

insert into public.product_inventory (product_id, product_name, stock)
values
    ('p1', 'FC Semisintético SAE 15W-40', 0),
    ('p2', 'FC Aceite Mineral 20W-50', 0),
    ('p3', 'Mobil Super 15W50 Moto 4T MX', 0),
    ('p4', 'Marcador Sharpie Punta Fina Permanente Azul', 0),
    ('p5', 'Gel de Árnica Sunt Life', 0),
    ('p6', 'FC API GL-1 Sincrónica 140', 0),
    ('p7', 'Silicón Líquido Pointer 30ml', 0),
    ('p8', 'Desodorante Ideal Roll-On 50g', 0),
    ('p9', 'Marcador Sharpie Punta Media Azul', 0),
    ('p10', 'Bolígrafo Semi Gel Offi-Esco Azul', 0),
    ('p11', 'Marcador Ofica Punta Media Azul', 0),
    ('p12', 'Silicón Líquido Penmax 30ml', 0),
    ('p13', 'Pega Blanca Líquida 40ml', 0),
    ('p14', 'Marcador Sharpie Punta Fina Rojo', 0),
    ('p15', 'FC Semisintético SAE 20W-50', 0),
    ('p16', 'Lápiz de Crayón HB Pointer', 0),
    ('p17', 'Pega en Barra Marfil 10g', 0),
    ('p18', 'Limpiador de Vidrios Dura Wash 500ml', 0),
    ('p19', 'Juego de Compás Escolar', 0),
    ('p20', 'Resaltador Sharpie Accent 3D Amarillo', 0),
    ('p21', 'Tijera Escolar', 0),
    ('p22', 'Block Milimetrado N&G', 0),
    ('p23', 'Borrador de Nata Mayka', 0),
    ('p24', 'Borrador de Nata Mayka Pequeño', 0),
    ('p25', 'Sacapuntas Fashion Klipp', 0),
    ('p26', 'Papel Milimetrado', 0),
    ('p27', 'Block Milimetrado Grupo Cinco', 0),
    ('p28', 'Bolígrafo Semi Gel Offi-Esco Negro', 0),
    ('p29', 'Cinta Adhesiva Pequeña Celoven', 0),
    ('p30', 'Block Rotulado Bond', 0),
    ('p31', 'Bolígrafo Marfil Negro', 0),
    ('p32', 'Colores Pointer', 0),
    ('p33', 'Colores Solita', 0),
    ('p34', 'Pinturas al Frío Black Color', 0),
    ('p35', 'Celoven 18mm 25m', 0),
    ('p36', 'Pinceles Artist Brushes', 0),
    ('p37', 'Lápices Pointer con Agarre Suave', 0),
    ('p39', 'Borrador de Pizarra XMK', 0),
    ('p40', 'Láminas de Papel Bond', 0)
on conflict (product_id) do update
set product_name = excluded.product_name;

alter table public.product_inventory enable row level security;
revoke all on public.product_inventory from anon, authenticated;
grant select on public.product_inventory to anon, authenticated;

drop policy if exists "Anyone can read product inventory" on public.product_inventory;
create policy "Anyone can read product inventory"
on public.product_inventory
for select
to anon, authenticated
using (true);

drop policy if exists "authenticated admins can update orders" on public.orders;
create policy "authenticated admins can update orders"
on public.orders
for update
to authenticated
using (public.is_chat_admin())
with check (public.is_chat_admin());
grant update on public.orders to authenticated;

create or replace function public.admin_set_product_stock(p_product_id text, p_stock integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    updated_stock integer;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para modificar el inventario.'
            using errcode = '42501';
    end if;
    if p_stock is null or p_stock < 0 or p_stock > 99999 then
        raise exception 'La cantidad debe estar entre 0 y 99999.'
            using errcode = '22023';
    end if;

    update public.product_inventory
    set stock = p_stock, updated_at = now()
    where product_id = p_product_id
    returning stock into updated_stock;

    if not found then
        raise exception 'El producto no existe en el inventario.'
            using errcode = 'P0002';
    end if;
    return updated_stock;
end;
$$;

revoke all on function public.admin_set_product_stock(text, integer) from public, anon;
grant execute on function public.admin_set_product_stock(text, integer) to authenticated;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_order public.orders%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para actualizar pedidos.'
            using errcode = '42501';
    end if;
    if p_status is null or p_status not in ('rejected', 'completed') then
        raise exception 'Estado de pedido no permitido.'
            using errcode = '22023';
    end if;

    select * into target_order
    from public.orders
    where id = p_order_id
    for update;

    if not found then
        raise exception 'El pedido no existe.' using errcode = 'P0002';
    end if;
    if (p_status = 'rejected' and target_order.status <> 'pending')
       or (p_status = 'completed' and target_order.status <> 'approved') then
        raise exception 'El pedido no permite esta transición de estado.'
            using errcode = '22023';
    end if;

    update public.orders
    set status = p_status,
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_order_id;

    return jsonb_build_object('order_id', p_order_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_set_order_status(uuid, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text) to authenticated;

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
begin
    if new.status = old.status then
        return new;
    end if;
    if auth.uid() is null or not public.is_chat_admin() then
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

drop trigger if exists enforce_order_status_transition on public.orders;
create trigger enforce_order_status_transition
before update of status on public.orders
for each row
execute function public.enforce_order_status_transition();

create or replace function public.admin_approve_order_with_inventory(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_order public.orders%rowtype;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para aprobar pedidos.'
            using errcode = '42501';
    end if;

    select * into target_order
    from public.orders
    where id = p_order_id
    for update;

    if not found then
        raise exception 'El pedido no existe.' using errcode = 'P0002';
    end if;
    if target_order.status <> 'pending' then
        raise exception 'Solo se pueden aprobar pedidos pendientes.'
            using errcode = '22023';
    end if;

    update public.orders
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_order_id;

    return jsonb_build_object('order_id', p_order_id, 'status', 'approved');
end;
$$;

revoke all on function public.admin_approve_order_with_inventory(uuid) from public, anon;
grant execute on function public.admin_approve_order_with_inventory(uuid) to authenticated;

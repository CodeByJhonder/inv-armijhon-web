-- Registra cambios en existencias a partir de la fecha de esta migracion.
-- Ejecutar despues de inventory-migration.sql y stock-alerts-migration.sql.

create table if not exists public.product_stock_movements (
    id bigint generated always as identity primary key,
    product_id text not null references public.product_inventory(product_id) on delete cascade,
    previous_stock integer not null check (previous_stock >= 0),
    new_stock integer not null check (new_stock >= 0),
    change_source text not null,
    changed_by uuid references auth.users(id) on delete set null,
    changed_at timestamptz not null default now(),
    constraint product_stock_movements_change_check check (previous_stock <> new_stock)
);

create index if not exists product_stock_movements_product_changed_at_idx
    on public.product_stock_movements (product_id, changed_at desc);

alter table public.product_stock_movements enable row level security;
revoke all on public.product_stock_movements from public, anon, authenticated;

create or replace function public.record_product_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    movement_source text;
begin
    if new.stock is not distinct from old.stock then
        return new;
    end if;

    movement_source := nullif(current_setting('app.stock_change_source', true), '');
    insert into public.product_stock_movements (
        product_id,
        previous_stock,
        new_stock,
        change_source,
        changed_by
    )
    values (
        new.product_id,
        old.stock,
        new.stock,
        coalesce(movement_source, 'Actualizacion de existencias'),
        auth.uid()
    );

    return new;
end;
$$;

revoke all on function public.record_product_stock_movement() from public, anon, authenticated;

drop trigger if exists record_product_stock_movement on public.product_inventory;
create trigger record_product_stock_movement
after update of stock on public.product_inventory
for each row
when (old.stock is distinct from new.stock)
execute function public.record_product_stock_movement();

create or replace function public.set_stock_change_context_for_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.status = 'pending' and new.status = 'approved' then
        perform set_config(
            'app.stock_change_source',
            'Aprobacion del pedido ' || new.id::text,
            true
        );
    end if;
    return new;
end;
$$;

revoke all on function public.set_stock_change_context_for_order() from public, anon, authenticated;

drop trigger if exists set_stock_change_context_for_order on public.orders;
create trigger set_stock_change_context_for_order
before update of status on public.orders
for each row
execute function public.set_stock_change_context_for_order();

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

    perform set_config('app.stock_change_source', 'Ajuste manual de existencias', true);
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

create or replace function public.admin_get_product_stock_history(p_product_id text, p_limit integer default 100)
returns table (
    id bigint,
    previous_stock integer,
    new_stock integer,
    quantity_change integer,
    change_source text,
    changed_at timestamptz,
    actor_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar el historial de inventario.'
            using errcode = '42501';
    end if;
    if p_product_id is null or not exists (
        select 1
        from public.product_inventory product
        where product.product_id = p_product_id
    ) then
        raise exception 'El producto no existe en el inventario.'
            using errcode = 'P0002';
    end if;

    return query
    select
        movement.id,
        movement.previous_stock,
        movement.new_stock,
        movement.new_stock - movement.previous_stock,
        movement.change_source,
        movement.changed_at,
        actor.email::text
    from public.product_stock_movements movement
    left join auth.users actor on actor.id = movement.changed_by
    where movement.product_id = p_product_id
    order by movement.changed_at desc, movement.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

revoke all on function public.admin_get_product_stock_history(text, integer) from public, anon;
grant execute on function public.admin_get_product_stock_history(text, integer) to authenticated;

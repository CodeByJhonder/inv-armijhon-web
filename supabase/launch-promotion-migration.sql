-- Oferta de lanzamiento para las primeras visitas unicas del navegador.
-- Ejecutar una vez en Supabase SQL Editor antes de desplegar launch-promotion.

create table if not exists public.launch_promotions (
    promotion_id text primary key,
    visitor_limit integer not null check (visitor_limit > 0),
    discounted_unit_limit integer not null check (discounted_unit_limit > 0)
);

insert into public.launch_promotions (promotion_id, visitor_limit, discounted_unit_limit)
values ('citrus-fresh-launch', 50, 2)
on conflict (promotion_id) do nothing;

create table if not exists public.launch_promo_visitors (
    visitor_hash text primary key check (visitor_hash ~ '^[a-f0-9]{64}$'),
    visit_number integer not null unique check (visit_number > 0),
    decision text not null default 'pending' check (decision in ('pending', 'accepted', 'rejected')),
    created_at timestamptz not null default now(),
    decided_at timestamptz
);

create table if not exists public.launch_promo_redemptions (
    id uuid primary key default gen_random_uuid(),
    promotion_id text not null references public.launch_promotions(promotion_id),
    visitor_hash text not null references public.launch_promo_visitors(visitor_hash),
    order_id uuid not null unique references public.orders(id) on delete cascade,
    discounted_quantity integer not null check (discounted_quantity > 0),
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
    created_at timestamptz not null default now()
);

alter table public.launch_promo_redemptions
    drop constraint if exists launch_promo_redemptions_visitor_hash_key;
create unique index if not exists launch_promo_one_active_redemption_per_visitor
    on public.launch_promo_redemptions(visitor_hash)
    where status in ('pending', 'approved', 'completed');

alter table public.launch_promotions enable row level security;
alter table public.launch_promo_visitors enable row level security;
alter table public.launch_promo_redemptions enable row level security;

revoke all on public.launch_promotions from anon, authenticated;
revoke all on public.launch_promo_visitors from anon, authenticated;
revoke all on public.launch_promo_redemptions from anon, authenticated;
grant all on public.launch_promotions to service_role;
grant all on public.launch_promo_visitors to service_role;
grant all on public.launch_promo_redemptions to service_role;

create or replace function public.register_launch_promo_visit(p_visitor_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    promo public.launch_promotions%rowtype;
    visitor public.launch_promo_visitors%rowtype;
    visitor_count integer;
    redeemed_count integer;
    visitor_has_active_redemption boolean;
begin
    if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$' then
        raise exception 'Identificador de visita no valido.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('launch-promo:citrus-fresh-launch', 0));
    select * into promo
      from public.launch_promotions
     where promotion_id = 'citrus-fresh-launch';
    if not found then
        raise exception 'La promocion no esta configurada.' using errcode = 'P0002';
    end if;

    select * into visitor
      from public.launch_promo_visitors
     where visitor_hash = p_visitor_hash;
    if not found then
        select count(*)::integer into visitor_count from public.launch_promo_visitors;
        if visitor_count >= promo.visitor_limit then
            select coalesce(sum(discounted_quantity), 0)::integer into redeemed_count
              from public.launch_promo_redemptions
             where promotion_id = promo.promotion_id
               and status in ('pending', 'approved', 'completed');
            return jsonb_build_object(
                'eligible', false,
                'decision', null,
                'visit_number', null,
                'visitor_limit', promo.visitor_limit,
                'discounted_unit_limit', promo.discounted_unit_limit,
                'remaining_discounted_units', greatest(0, promo.discounted_unit_limit - redeemed_count)
            );
        end if;

        insert into public.launch_promo_visitors (visitor_hash, visit_number)
        values (p_visitor_hash, visitor_count + 1)
        returning * into visitor;
    end if;

    select coalesce(sum(discounted_quantity), 0)::integer into redeemed_count
      from public.launch_promo_redemptions
     where promotion_id = promo.promotion_id
       and status in ('pending', 'approved', 'completed');
    select exists (
        select 1
          from public.launch_promo_redemptions
         where visitor_hash = p_visitor_hash
           and status in ('pending', 'approved', 'completed')
    ) into visitor_has_active_redemption;

    return jsonb_build_object(
        'eligible', true,
        'decision', visitor.decision,
        'visit_number', visitor.visit_number,
        'visitor_limit', promo.visitor_limit,
        'discounted_unit_limit', promo.discounted_unit_limit,
        'remaining_discounted_units', greatest(0, promo.discounted_unit_limit - redeemed_count),
        'has_active_redemption', visitor_has_active_redemption
    );
end;
$$;

create or replace function public.decide_launch_promo(p_visitor_hash text, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    visitor public.launch_promo_visitors%rowtype;
    promo public.launch_promotions%rowtype;
    redeemed_count integer;
    visitor_has_active_redemption boolean;
begin
    if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$'
       or p_decision is null or p_decision not in ('accepted', 'rejected') then
        raise exception 'Decision de promocion no valida.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('launch-promo:citrus-fresh-launch', 0));
    select * into visitor
      from public.launch_promo_visitors
     where visitor_hash = p_visitor_hash
     for update;
    if not found then
        raise exception 'No se encontro la visita a la promocion.' using errcode = 'P0002';
    end if;

    if visitor.decision = 'pending' then
        update public.launch_promo_visitors
           set decision = p_decision, decided_at = now()
         where visitor_hash = p_visitor_hash
        returning * into visitor;
    elsif visitor.decision <> p_decision then
        raise exception 'Ya se registro otra decision para esta oferta.' using errcode = '23505';
    end if;

    select * into promo
      from public.launch_promotions
     where promotion_id = 'citrus-fresh-launch';
    select coalesce(sum(discounted_quantity), 0)::integer into redeemed_count
      from public.launch_promo_redemptions
     where promotion_id = promo.promotion_id
       and status in ('pending', 'approved', 'completed');
    select exists (
        select 1
          from public.launch_promo_redemptions
         where visitor_hash = p_visitor_hash
           and status in ('pending', 'approved', 'completed')
    ) into visitor_has_active_redemption;

    return jsonb_build_object(
        'eligible', true,
        'decision', visitor.decision,
        'visit_number', visitor.visit_number,
        'visitor_limit', promo.visitor_limit,
        'discounted_unit_limit', promo.discounted_unit_limit,
        'remaining_discounted_units', greatest(0, promo.discounted_unit_limit - redeemed_count),
        'has_active_redemption', visitor_has_active_redemption
    );
end;
$$;

create or replace function public.reserve_launch_promo_redemption(
    p_visitor_hash text,
    p_order_id uuid,
    p_discounted_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    promo public.launch_promotions%rowtype;
    visitor public.launch_promo_visitors%rowtype;
    current_redemptions integer;
    order_status text;
    submitted_quantity integer;
begin
    if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$'
       or p_discounted_quantity is null
       or p_discounted_quantity < 1 then
        raise exception 'Canje de promocion no valido.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('launch-promo:citrus-fresh-launch', 0));
    select * into promo
      from public.launch_promotions
     where promotion_id = 'citrus-fresh-launch';
    select * into visitor
      from public.launch_promo_visitors
     where visitor_hash = p_visitor_hash
     for update;
    if not found or visitor.decision <> 'accepted' then
        raise exception 'Esta visita no tiene una oferta aceptada.' using errcode = '42501';
    end if;

    select status into order_status
      from public.orders
     where id = p_order_id
     for update;
    if order_status is distinct from 'pending' then
        raise exception 'El pedido no esta disponible para reservar la oferta.' using errcode = '22023';
    end if;

    select coalesce(sum(quantity), 0)::integer into submitted_quantity
      from public.order_items
     where order_id = p_order_id
       and product_id = 'p38'
       and unit_price_usd = 5.00
       and line_total_usd = round(quantity * unit_price_usd, 2);
    if submitted_quantity <> p_discounted_quantity then
        raise exception 'La cantidad promocional no coincide con el pedido.' using errcode = '22023';
    end if;

    select coalesce(sum(discounted_quantity), 0)::integer into current_redemptions
      from public.launch_promo_redemptions
     where promotion_id = promo.promotion_id
       and status in ('pending', 'approved', 'completed');
    if current_redemptions + p_discounted_quantity > promo.discounted_unit_limit then
        return jsonb_build_object(
            'reserved', false,
            'remaining_discounted_units', greatest(0, promo.discounted_unit_limit - current_redemptions)
        );
    end if;

    insert into public.launch_promo_redemptions (
        promotion_id, visitor_hash, order_id, discounted_quantity, status
    ) values (
        promo.promotion_id, p_visitor_hash, p_order_id, p_discounted_quantity, 'pending'
    );

    return jsonb_build_object(
        'reserved', true,
        'remaining_discounted_units', promo.discounted_unit_limit - current_redemptions - p_discounted_quantity
    );
end;
$$;

create or replace function public.sync_launch_promo_redemption_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status is distinct from old.status then
        update public.launch_promo_redemptions
           set status = new.status
         where order_id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists sync_launch_promo_redemption_status on public.orders;
create trigger sync_launch_promo_redemption_status
after update of status on public.orders
for each row execute function public.sync_launch_promo_redemption_status();

revoke all on function public.register_launch_promo_visit(text) from public, anon, authenticated;
revoke all on function public.decide_launch_promo(text, text) from public, anon, authenticated;
revoke all on function public.reserve_launch_promo_redemption(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.sync_launch_promo_redemption_status() from public, anon, authenticated;
grant execute on function public.register_launch_promo_visit(text) to service_role;
grant execute on function public.decide_launch_promo(text, text) to service_role;
grant execute on function public.reserve_launch_promo_redemption(text, uuid, integer) to service_role;

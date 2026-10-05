-- Ejecutar despues de launch-promotion-migration.sql.
-- Solo un administrador autenticado puede consultar estos contadores.

create or replace function public.admin_launch_promo_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    promo public.launch_promotions%rowtype;
    registered_visitors integer;
    reserved_units integer;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar el resumen de la promocion.'
            using errcode = '42501';
    end if;

    select * into promo
      from public.launch_promotions
     where promotion_id = 'citrus-fresh-launch';
    if not found then
        raise exception 'La promocion no esta configurada.'
            using errcode = 'P0002';
    end if;

    select count(*)::integer into registered_visitors
      from public.launch_promo_visitors;
    select coalesce(sum(discounted_quantity), 0)::integer into reserved_units
      from public.launch_promo_redemptions
     where promotion_id = promo.promotion_id
       and status in ('pending', 'approved', 'completed');

    return jsonb_build_object(
        'visitor_limit', promo.visitor_limit,
        'registered_visitors', registered_visitors,
        'visitor_slots_remaining', greatest(0, promo.visitor_limit - registered_visitors),
        'discounted_unit_limit', promo.discounted_unit_limit,
        'reserved_discounted_units', reserved_units,
        'discounted_units_remaining', greatest(0, promo.discounted_unit_limit - reserved_units)
    );
end;
$$;

revoke all on function public.admin_launch_promo_summary() from public, anon;
grant execute on function public.admin_launch_promo_summary() to authenticated;

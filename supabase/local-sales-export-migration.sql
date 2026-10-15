-- Read all local sale lines in a requested reporting period for admin exports.
-- Run after local-sales-batch-migration.sql.

create or replace function public.admin_export_local_sales(
    p_from date,
    p_through date
)
returns table (
    id uuid,
    batch_id uuid,
    sold_on date,
    created_at timestamptz,
    product_name text,
    quantity integer,
    unit text,
    currency text,
    unit_price_usd numeric,
    total_usd numeric,
    total_amount numeric,
    exchange_rate numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para exportar ventas locales.' using errcode = '42501';
    end if;
    if p_from is null or p_through is null or p_from > p_through
       or p_through > current_date or p_through - p_from > 3660 then
        raise exception 'El período de exportación no es válido.' using errcode = '22023';
    end if;

    return query
    select sale.id, sale.batch_id, sale.sold_on, sale.created_at,
           sale.product_name, sale.quantity, sale.unit, sale.currency,
           sale.unit_price_usd, sale.total_usd, sale.total_amount, sale.exchange_rate
    from public.local_sales sale
    where sale.sold_on between p_from and p_through
    order by sale.sold_on, sale.created_at, sale.id;
end;
$$;

revoke all on function public.admin_export_local_sales(date, date) from public, anon;
grant execute on function public.admin_export_local_sales(date, date) to authenticated;

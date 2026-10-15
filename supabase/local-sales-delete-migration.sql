-- Admin deletion tools for local sale history.
-- Run after local-sales-batch-migration.sql.
-- Removing history rows does not change inventory stock.

create or replace function public.admin_delete_local_sales(
    p_sale_ids uuid[] default null,
    p_from date default null,
    p_through date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted_count integer;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para eliminar ventas locales.' using errcode = '42501';
    end if;

    if p_sale_ids is not null then
        if cardinality(p_sale_ids) < 1 or cardinality(p_sale_ids) > 200
           or p_from is not null or p_through is not null then
            raise exception 'La selección de ventas no es válida.' using errcode = '22023';
        end if;

        delete from public.local_sales
        where id = any(p_sale_ids);
    else
        if p_from is null or p_through is null or p_from > p_through
           or p_through > current_date or p_through - p_from > 370 then
            raise exception 'El período indicado no es válido.' using errcode = '22023';
        end if;

        delete from public.local_sales
        where sold_on between p_from and p_through;
    end if;

    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

revoke all on function public.admin_delete_local_sales(uuid[], date, date) from public, anon;
grant execute on function public.admin_delete_local_sales(uuid[], date, date) to authenticated;

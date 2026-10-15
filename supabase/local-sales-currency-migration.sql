-- Add USD, VES and COP payment recording to local product sales.
-- Run after local-sales-migration.sql. Existing sales remain recorded as USD.

alter table public.local_sales
    add column if not exists currency text not null default 'USD',
    add column if not exists total_amount numeric(14, 2),
    add column if not exists exchange_rate numeric(18, 6);

update public.local_sales
set total_amount = total_usd
where total_amount is null;

alter table public.local_sales
    drop constraint if exists local_sales_unit_price_usd_check,
    drop constraint if exists local_sales_total_usd_check,
    drop constraint if exists local_sales_currency_check,
    drop constraint if exists local_sales_total_amount_check,
    drop constraint if exists local_sales_exchange_rate_check,
    drop constraint if exists local_sales_currency_fields_check;

alter table public.local_sales
    alter column unit_price_usd drop not null,
    alter column total_usd drop not null,
    alter column total_amount set not null,
    alter column unit_price_usd type numeric(14, 2),
    alter column total_usd type numeric(14, 2);

alter table public.local_sales
    add constraint local_sales_unit_price_usd_check
        check (unit_price_usd is null or unit_price_usd > 0),
    add constraint local_sales_total_usd_check
        check (total_usd is null or total_usd > 0),
    add constraint local_sales_currency_check
        check (currency in ('USD', 'VES', 'COP')),
    add constraint local_sales_total_amount_check
        check (total_amount > 0),
    add constraint local_sales_exchange_rate_check
        check (exchange_rate is null or exchange_rate > 0),
    add constraint local_sales_currency_fields_check
        check (
            (currency = 'USD' and unit_price_usd is not null and total_usd is not null
                and exchange_rate is null and total_amount = total_usd)
            or (currency = 'VES' and unit_price_usd is not null and total_usd is not null
                and exchange_rate is not null
                and total_amount = round(total_usd * exchange_rate, 2))
            or (currency = 'COP' and unit_price_usd is null and total_usd is null
                and exchange_rate is null and total_amount = trunc(total_amount))
        );

-- Replace the USD-only RPC with a currency-aware atomic sale operation.
drop function if exists public.admin_record_local_product_sale(text, integer, numeric, date);

create function public.admin_record_local_product_sale(
    p_product_id text,
    p_quantity integer,
    p_currency text,
    p_amount numeric,
    p_exchange_rate numeric,
    p_sold_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_product public.product_inventory%rowtype;
    sale_id uuid := gen_random_uuid();
    clean_currency text := upper(btrim(p_currency));
    rounded_unit_price_usd numeric(12, 2);
    sale_total_usd numeric(14, 2);
    charged_total numeric;
    saved_exchange_rate numeric(18, 6);
    remaining_stock integer;
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para registrar ventas locales.' using errcode = '42501';
    end if;
    if p_product_id is null or btrim(p_product_id) = '' then
        raise exception 'Selecciona un producto valido.' using errcode = '22023';
    end if;
    if p_quantity is null or p_quantity < 1 or p_quantity > 99999 then
        raise exception 'La cantidad debe estar entre 1 y 99999.' using errcode = '22023';
    end if;
    if clean_currency is null or clean_currency not in ('USD', 'VES', 'COP') then
        raise exception 'La moneda debe ser USD, VES o COP.' using errcode = '22023';
    end if;
    if p_sold_on is null or p_sold_on > current_date then
        raise exception 'La fecha de venta no puede estar vacia ni en el futuro.' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'Indica un monto mayor que cero.' using errcode = '22023';
    end if;

    if clean_currency in ('USD', 'VES') then
        if p_amount > 999999.99 then
            raise exception 'El precio unitario en USD no puede superar 999999.99.' using errcode = '22023';
        end if;
        rounded_unit_price_usd := round(p_amount, 2);
        sale_total_usd := round(rounded_unit_price_usd * p_quantity, 2);
        if clean_currency = 'USD' then
            charged_total := sale_total_usd;
            saved_exchange_rate := null;
        else
            if p_exchange_rate is null or p_exchange_rate <= 0 or p_exchange_rate > 1000000000 then
                raise exception 'No hay una tasa USD/VES valida para esta venta.' using errcode = '22023';
            end if;
            saved_exchange_rate := round(p_exchange_rate, 6);
            if sale_total_usd * saved_exchange_rate > 999999999999.99 then
                raise exception 'El total convertido en bolivares supera el limite permitido.' using errcode = '22023';
            end if;
            charged_total := round(sale_total_usd * saved_exchange_rate, 2);
        end if;
    else
        if p_amount > 999999999999.99 then
            raise exception 'El total en pesos colombianos supera el limite permitido.' using errcode = '22023';
        end if;
        if p_amount <> trunc(p_amount) then
            raise exception 'El total en pesos colombianos debe ser un numero entero.' using errcode = '22023';
        end if;
        charged_total := round(p_amount, 2);
        rounded_unit_price_usd := null;
        sale_total_usd := null;
        saved_exchange_rate := null;
    end if;

    select * into target_product
    from public.product_inventory
    where product_id = btrim(p_product_id) and is_active = true
    for update;

    if not found then
        raise exception 'El producto no existe o esta archivado.' using errcode = 'P0002';
    end if;
    if target_product.stock < p_quantity then
        raise exception 'Stock insuficiente para %: disponibles %, solicitadas %.',
            target_product.product_name, target_product.stock, p_quantity
            using errcode = 'P0001';
    end if;

    remaining_stock := target_product.stock - p_quantity;
    perform set_config('app.stock_change_source', 'Venta local ' || sale_id::text, true);
    update public.product_inventory
    set stock = remaining_stock, updated_at = now()
    where product_id = target_product.product_id;

    insert into public.local_sales (
        id, sale_type, product_id, product_name, quantity, unit,
        unit_price_usd, total_usd, currency, total_amount, exchange_rate,
        sold_on, created_by
    ) values (
        sale_id, 'product', target_product.product_id, target_product.product_name,
        p_quantity, target_product.unit, rounded_unit_price_usd, sale_total_usd,
        clean_currency, charged_total, saved_exchange_rate, p_sold_on, auth.uid()
    );

    return jsonb_build_object(
        'id', sale_id,
        'sale_type', 'product',
        'product_id', target_product.product_id,
        'product_name', target_product.product_name,
        'quantity', p_quantity,
        'unit', target_product.unit,
        'currency', clean_currency,
        'unit_price_usd', rounded_unit_price_usd,
        'total_usd', sale_total_usd,
        'total_amount', charged_total,
        'exchange_rate', saved_exchange_rate,
        'sold_on', p_sold_on,
        'remaining_stock', remaining_stock
    );
end;
$$;

revoke all on function public.admin_record_local_product_sale(text, integer, text, numeric, numeric, date) from public, anon;
grant execute on function public.admin_record_local_product_sale(text, integer, text, numeric, numeric, date) to authenticated;

-- The table-returning function's result shape now includes the charged currency and rate.
drop function if exists public.admin_list_local_sales(integer);
create function public.admin_list_local_sales(p_limit integer default 200)
returns table (
    id uuid,
    sale_type text,
    product_id text,
    product_name text,
    quantity integer,
    unit text,
    unit_price_usd numeric,
    total_usd numeric,
    currency text,
    total_amount numeric,
    exchange_rate numeric,
    sold_on date,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_chat_admin() then
        raise exception 'No tienes permiso para consultar ventas locales.' using errcode = '42501';
    end if;

    return query
    select sale.id, sale.sale_type, sale.product_id, sale.product_name,
           sale.quantity, sale.unit, sale.unit_price_usd, sale.total_usd,
           sale.currency, sale.total_amount, sale.exchange_rate,
           sale.sold_on, sale.created_at
    from public.local_sales sale
    order by sale.sold_on desc, sale.created_at desc, sale.id desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.admin_list_local_sales(integer) from public, anon;
grant execute on function public.admin_list_local_sales(integer) to authenticated;

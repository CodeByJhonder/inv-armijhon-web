-- Adapt insurance intake to the exact Elorza sales module fields.
-- Run after vehicle-insurance-migration.sql. Existing case and policy data is preserved.

alter table public.insurance_cases
    add column if not exists sales_location text not null default 'Elorza, Apure',
    add column if not exists ally text,
    add column if not exists customer_address text,
    add column if not exists customer_postal_code text,
    add column if not exists license_grade text,
    add column if not exists economic_activity text,
    add column if not exists vehicle_cylinders integer,
    add column if not exists amount_charged numeric(14, 2),
    add column if not exists payment_method text,
    add column if not exists identity_photo_path text,
    add column if not exists identity_photo_name text,
    add column if not exists circulation_card_photo_path text,
    add column if not exists circulation_card_photo_name text;

-- Backfill the historical date only the first time this field is introduced.
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'insurance_cases'
          and column_name = 'sales_date'
    ) then
        alter table public.insurance_cases add column sales_date date;
        update public.insurance_cases set sales_date = created_at::date where created_at is not null;
        alter table public.insurance_cases alter column sales_date set default current_date;
        alter table public.insurance_cases alter column sales_date set not null;
    end if;
end;
$$;

-- Older intake fields remain for historical cases, but new insurance cases do not
-- require a typed name, make/model, or plate because the submitted documents provide them.
alter table public.insurance_cases
    alter column customer_name drop not null,
    alter column vehicle_make drop not null,
    alter column vehicle_model drop not null,
    alter column vehicle_plate drop not null;

alter table public.insurance_cases
    drop constraint if exists insurance_cases_economic_activity_check,
    drop constraint if exists insurance_cases_vehicle_cylinders_check,
    drop constraint if exists insurance_cases_amount_charged_check,
    drop constraint if exists insurance_cases_sales_fields_check;

alter table public.insurance_cases
    add constraint insurance_cases_economic_activity_check
        check (economic_activity is null or economic_activity in ('independiente', 'empleado', 'socio')),
    add constraint insurance_cases_vehicle_cylinders_check
        check (vehicle_cylinders is null or vehicle_cylinders between 1 and 32),
    add constraint insurance_cases_amount_charged_check
        check (amount_charged is null or amount_charged > 0),
    add constraint insurance_cases_sales_fields_check
        check (
            char_length(sales_location) between 2 and 120
            and char_length(coalesce(ally, '')) <= 120
            and char_length(coalesce(customer_address, '')) <= 240
            and char_length(coalesce(customer_postal_code, '')) <= 20
            and char_length(coalesce(license_grade, '')) <= 40
            and char_length(coalesce(payment_method, '')) <= 80
        );

create index if not exists insurance_cases_sales_date_idx
    on public.insurance_cases (sales_date desc);

-- New uploads are the two requested photos; retain existing stored objects.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'insurance-documents';

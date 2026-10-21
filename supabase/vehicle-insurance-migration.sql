-- Private intake and administration for vehicle insurance requests/policies.
-- Run this migration in Supabase SQL Editor before deploying the website/function.

create table if not exists public.insurance_cases (
    id uuid primary key default gen_random_uuid(),
    source text not null default 'web' check (source in ('web', 'admin')),
    status text not null default 'new' check (status in (
        'new', 'documents_pending', 'in_review', 'quoted', 'sold', 'renewal_due', 'closed', 'cancelled'
    )),
    customer_name text not null check (char_length(btrim(customer_name)) between 2 and 120),
    customer_document text,
    customer_phone text not null check (char_length(btrim(customer_phone)) between 7 and 40),
    customer_email text,
    vehicle_make text not null check (char_length(btrim(vehicle_make)) between 1 and 80),
    vehicle_model text not null check (char_length(btrim(vehicle_model)) between 1 and 100),
    vehicle_year smallint check (vehicle_year between 1900 and 2100),
    vehicle_plate text not null check (char_length(btrim(vehicle_plate)) between 4 and 16),
    vehicle_serial text,
    request_notes text,
    admin_notes text,
    document_path text,
    document_name text,
    quote_amount numeric(14, 2) check (quote_amount is null or quote_amount > 0),
    quote_currency text check (quote_currency is null or quote_currency in ('USD', 'VES', 'COP')),
    insurer text,
    policy_number text,
    policy_start date,
    policy_end date,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint insurance_cases_policy_dates_check check (
        policy_start is null or policy_end is null or policy_end >= policy_start
    )
);

create index if not exists insurance_cases_created_at_idx
    on public.insurance_cases (created_at desc);
create index if not exists insurance_cases_status_idx
    on public.insurance_cases (status, created_at desc);
create index if not exists insurance_cases_plate_idx
    on public.insurance_cases (upper(vehicle_plate));
create index if not exists insurance_cases_phone_idx
    on public.insurance_cases (customer_phone);

alter table public.insurance_cases enable row level security;
revoke all on public.insurance_cases from public, anon, authenticated;
grant select, insert, update on public.insurance_cases to authenticated;
grant all on public.insurance_cases to service_role;

drop policy if exists "Insurance admins can read cases" on public.insurance_cases;
create policy "Insurance admins can read cases"
on public.insurance_cases for select to authenticated
using (public.is_chat_admin());

drop policy if exists "Insurance admins can create cases" on public.insurance_cases;
create policy "Insurance admins can create cases"
on public.insurance_cases for insert to authenticated
with check (public.is_chat_admin() and (created_by is null or created_by = auth.uid()));

drop policy if exists "Insurance admins can update cases" on public.insurance_cases;
create policy "Insurance admins can update cases"
on public.insurance_cases for update to authenticated
using (public.is_chat_admin())
with check (public.is_chat_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'insurance-documents', 'insurance-documents', false, 5242880,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Insurance admins can read documents" on storage.objects;
create policy "Insurance admins can read documents"
on storage.objects for select to authenticated
using (bucket_id = 'insurance-documents' and public.is_chat_admin());

drop policy if exists "Insurance admins can upload documents" on storage.objects;
create policy "Insurance admins can upload documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'insurance-documents' and public.is_chat_admin());

drop policy if exists "Insurance admins can replace documents" on storage.objects;
create policy "Insurance admins can replace documents"
on storage.objects for update to authenticated
using (bucket_id = 'insurance-documents' and public.is_chat_admin())
with check (bucket_id = 'insurance-documents' and public.is_chat_admin());

drop policy if exists "Insurance admins can delete documents" on storage.objects;
create policy "Insurance admins can delete documents"
on storage.objects for delete to authenticated
using (bucket_id = 'insurance-documents' and public.is_chat_admin());

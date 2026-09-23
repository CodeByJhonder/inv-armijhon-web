-- Supabase schema for INV. Armijhon orders and payment receipts.
-- Run this file in Supabase SQL Editor.

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_name text not null,
    customer_phone text not null,
    payment_method text not null check (payment_method in ('pago_movil', 'transferencia')),
    currency text not null default 'VES' check (currency = 'VES'),
    exchange_rate numeric(12, 4) not null,
    total_usd numeric(12, 2) not null check (total_usd >= 0),
    total_ves numeric(14, 2) not null check (total_ves >= 0),
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
    notes text,
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references auth.users(id)
);

create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id text not null,
    product_name text not null,
    quantity integer not null check (quantity > 0),
    unit_price_usd numeric(12, 2) not null check (unit_price_usd >= 0),
    line_total_usd numeric(12, 2) not null check (line_total_usd >= 0)
);

create table if not exists public.payment_receipts (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null unique references public.orders(id) on delete cascade,
    storage_path text not null,
    original_name text not null,
    mime_type text not null,
    file_size integer not null check (file_size > 0 and file_size <= 5242880),
    uploaded_at timestamptz not null default now(),
    ocr_status text not null default 'pending' check (ocr_status in ('pending', 'completed', 'failed', 'skipped')),
    ocr_text text,
    reference_number text,
    ocr_confidence numeric(5, 2)
);

alter table public.payment_receipts add column if not exists ocr_status text not null default 'pending';
alter table public.payment_receipts add column if not exists ocr_text text;
alter table public.payment_receipts add column if not exists reference_number text;
alter table public.payment_receipts add column if not exists ocr_confidence numeric(5, 2);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_receipts enable row level security;

-- Customers can submit orders and receipts through a controlled Edge Function.
-- Do not expose broad anonymous insert policies from the browser.
-- Admin access should use authenticated users and policies added below.

create policy "authenticated admins can read orders"
on public.orders for select
to authenticated
using (true);

create policy "authenticated admins can update orders"
on public.orders for update
to authenticated
using (true)
with check (true);

create policy "authenticated admins can read order items"
on public.order_items for select
to authenticated
using (true);

create policy "authenticated admins can read receipts"
on public.payment_receipts for select
to authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

create policy "authenticated admins can read payment files"
on storage.objects for select
to authenticated
using (bucket_id = 'payment-receipts');

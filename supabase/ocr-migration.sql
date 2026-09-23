-- Ejecutar una vez en Supabase SQL Editor para habilitar los datos OCR.
alter table public.payment_receipts add column if not exists ocr_status text not null default 'pending';
alter table public.payment_receipts add column if not exists ocr_text text;
alter table public.payment_receipts add column if not exists reference_number text;
alter table public.payment_receipts add column if not exists ocr_confidence numeric(5, 2);

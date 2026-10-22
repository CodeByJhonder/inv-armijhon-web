-- Add private payment proof uploads to the vehicle insurance sales module.
-- Run after vehicle-insurance-sales-fields-migration.sql.

alter table public.insurance_cases
    add column if not exists payment_proof_path text,
    add column if not exists payment_proof_name text;

alter table public.insurance_cases
    drop constraint if exists insurance_cases_payment_proof_fields_check;

alter table public.insurance_cases
    add constraint insurance_cases_payment_proof_fields_check
    check (
        char_length(coalesce(payment_proof_path, '')) <= 500
        and char_length(coalesce(payment_proof_name, '')) <= 160
        and ((payment_proof_path is null) = (payment_proof_name is null))
    );

-- The bucket stays private. Existing records and stored files are preserved.
update storage.buckets
set file_size_limit = 16777216,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'insurance-documents';

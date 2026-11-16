create table if not exists public.local_expenses (
 id uuid primary key default gen_random_uuid(), description text not null check (char_length(btrim(description)) between 2 and 160),
 category text not null check (category in ('Inventario','Servicios','Transporte','Alquiler','Personal','Mantenimiento','Otro')),
 currency text not null check (currency in ('USD','VES','COP')), amount numeric(14,2) not null check (amount>0),
 spent_on date not null default current_date, note text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 constraint local_expenses_cop_integer check(currency<>'COP' or amount=trunc(amount)), constraint local_expenses_note_length check(note is null or char_length(note)<=240)
);
create index if not exists local_expenses_spent_on_idx on public.local_expenses(spent_on desc,created_at desc);
alter table public.local_expenses enable row level security;
revoke all on public.local_expenses from public,anon,authenticated;
create or replace function public.admin_record_expense(p_description text,p_category text,p_currency text,p_amount numeric,p_spent_on date,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.local_expenses%rowtype; begin
 if auth.uid() is null or not public.is_chat_admin() then raise exception 'No tienes permiso para registrar egresos.' using errcode='42501'; end if;
 if p_description is null or char_length(btrim(p_description)) not between 2 and 160 or p_category not in ('Inventario','Servicios','Transporte','Alquiler','Personal','Mantenimiento','Otro') or p_currency not in ('USD','VES','COP') or p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_spent_on is null or p_spent_on>current_date or (p_currency='COP' and p_amount<>trunc(p_amount)) or (p_note is not null and char_length(p_note)>240) then raise exception 'Revisa los datos del egreso.' using errcode='22023'; end if;
 insert into public.local_expenses(description,category,currency,amount,spent_on,note,created_by) values(btrim(p_description),p_category,p_currency,case when p_currency='COP' then p_amount else round(p_amount,2) end,p_spent_on,nullif(btrim(p_note),''),auth.uid()) returning * into saved;
 return jsonb_build_object('id',saved.id,'description',saved.description,'amount',saved.amount,'currency',saved.currency);
end; $$;
revoke all on function public.admin_record_expense(text,text,text,numeric,date,text) from public,anon;
grant execute on function public.admin_record_expense(text,text,text,numeric,date,text) to authenticated;
create or replace function public.admin_list_expenses(p_limit integer default 200)
returns table(id uuid,description text,category text,currency text,amount numeric,spent_on date,note text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_chat_admin() then raise exception 'No tienes permiso para consultar egresos.' using errcode='42501'; end if;
 return query select e.id,e.description,e.category,e.currency,e.amount,e.spent_on,e.note,e.created_at from public.local_expenses e order by e.spent_on desc,e.created_at desc limit greatest(1,least(coalesce(p_limit,200),500)); end; $$;
revoke all on function public.admin_list_expenses(integer) from public,anon;
grant execute on function public.admin_list_expenses(integer) to authenticated;
notify pgrst,'reload schema';

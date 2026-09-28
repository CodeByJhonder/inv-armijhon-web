-- Chat de atencion para INV. Armijhon.
-- Ejecutar una vez en Supabase SQL Editor antes de desplegar customer-chat.

create table if not exists public.chat_conversations (
    id uuid primary key default gen_random_uuid(),
    customer_name text not null check (char_length(customer_name) between 2 and 80),
    customer_phone text not null check (char_length(customer_phone) between 7 and 30),
    session_token_hash text not null,
    status text not null default 'open' check (status in ('open', 'closed')),
    last_message_preview text,
    last_message_at timestamptz not null default now(),
    admin_unread integer not null default 0 check (admin_unread >= 0),
    customer_unread integer not null default 0 check (customer_unread >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
    sender text not null check (sender in ('customer', 'admin')),
    body text not null check (char_length(body) between 1 and 1500),
    created_at timestamptz not null default now()
);

create table if not exists public.chat_admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);

create index if not exists chat_conversations_last_message_idx
    on public.chat_conversations(last_message_at desc);
create index if not exists chat_messages_conversation_created_idx
    on public.chat_messages(conversation_id, created_at);

create or replace function public.update_chat_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.chat_conversations
    set last_message_preview = left(new.body, 180),
        last_message_at = new.created_at,
        admin_unread = case
            when new.sender = 'customer' then admin_unread + 1
            else admin_unread
        end,
        customer_unread = case
            when new.sender = 'admin' then customer_unread + 1
            else customer_unread
        end
    where id = new.conversation_id;
    return new;
end;
$$;

drop trigger if exists chat_message_updates_conversation on public.chat_messages;
create trigger chat_message_updates_conversation
after insert on public.chat_messages
for each row execute function public.update_chat_conversation_after_message();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_admins enable row level security;

revoke all on public.chat_conversations from anon;
revoke all on public.chat_messages from anon;
revoke all on public.chat_admins from anon, authenticated;
grant select on public.chat_conversations to authenticated;
grant select on public.chat_messages to authenticated;

create or replace function public.is_chat_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.chat_admins
        where user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_chat_admin() from public;
grant execute on function public.is_chat_admin() to authenticated;

drop policy if exists "authenticated admins can read chat conversations" on public.chat_conversations;
create policy "authenticated admins can read chat conversations"
on public.chat_conversations for select
to authenticated
using (public.is_chat_admin());

drop policy if exists "authenticated admins can read chat messages" on public.chat_messages;
create policy "authenticated admins can read chat messages"
on public.chat_messages for select
to authenticated
using (public.is_chat_admin());

do $$
begin
    alter publication supabase_realtime add table public.chat_conversations;
exception when duplicate_object then
    null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then
    null;
end;
$$;

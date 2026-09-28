-- Private Web Push subscriptions for customer and administrator chat alerts.
-- Run after chat-migration.sql has created chat_conversations and chat_admins.

create table if not exists public.chat_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    endpoint text not null unique check (char_length(endpoint) between 1 and 2048),
    p256dh text not null,
    auth text not null,
    audience text not null check (audience in ('admin', 'customer')),
    admin_user_id uuid references auth.users(id) on delete cascade,
    conversation_id uuid references public.chat_conversations(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint chat_push_subscription_owner_check check (
        (audience = 'admin' and admin_user_id is not null and conversation_id is null)
        or
        (audience = 'customer' and admin_user_id is null and conversation_id is not null)
    )
);

create index if not exists chat_push_subscriptions_admin_idx
    on public.chat_push_subscriptions(admin_user_id)
    where audience = 'admin';

create index if not exists chat_push_subscriptions_customer_idx
    on public.chat_push_subscriptions(conversation_id)
    where audience = 'customer';

alter table public.chat_push_subscriptions enable row level security;
revoke all on public.chat_push_subscriptions from public, anon, authenticated;
grant all on public.chat_push_subscriptions to service_role;

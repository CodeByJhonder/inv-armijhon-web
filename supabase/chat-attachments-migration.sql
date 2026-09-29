-- Private file attachments for chat messages.
-- Run after chat-migration.sql.

alter table public.chat_messages
    add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.chat_messages
    drop constraint if exists chat_messages_body_check;

alter table public.chat_messages
    add constraint chat_messages_body_check
    check (
        char_length(body) between 1 and 1500
        or (body = '' and jsonb_array_length(attachments) > 0)
    );

alter table public.chat_messages
    drop constraint if exists chat_messages_attachments_check;

alter table public.chat_messages
    add constraint chat_messages_attachments_check
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'chat-attachments',
    'chat-attachments',
    false,
    10485760,
    array['image/*', 'application/pdf']
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

revoke all on storage.objects from anon;

create or replace function public.update_chat_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.chat_conversations
    set last_message_preview = case
            when char_length(trim(new.body)) > 0 then left(new.body, 180)
            when jsonb_array_length(new.attachments) > 0 then
                'Adjunto: ' || left(new.attachments -> 0 ->> 'name', 160)
            else null
        end,
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

-- Guarda quien envio el ultimo mensaje para separar conversaciones por responder
-- de las conversaciones contestadas por la tienda.
-- Ejecutar despues de chat-migration.sql y chat-attachments-migration.sql.

alter table public.chat_conversations
    add column if not exists last_message_sender text;

alter table public.chat_conversations
    drop constraint if exists chat_conversations_last_message_sender_check;

alter table public.chat_conversations
    add constraint chat_conversations_last_message_sender_check
    check (last_message_sender is null or last_message_sender in ('customer', 'admin'));

update public.chat_conversations conversation
set last_message_sender = (
    select message.sender
    from public.chat_messages message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
);

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
            when jsonb_array_length(coalesce(new.attachments, '[]'::jsonb)) > 0 then
                'Adjunto: ' || left(new.attachments -> 0 ->> 'name', 160)
            else null
        end,
        last_message_at = new.created_at,
        last_message_sender = new.sender,
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

revoke all on function public.update_chat_conversation_after_message() from public, anon, authenticated;

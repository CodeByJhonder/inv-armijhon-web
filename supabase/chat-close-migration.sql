-- Impide insertar mensajes en conversaciones cerradas, incluso ante solicitudes simultaneas.
-- Ejecutar una vez en Supabase SQL Editor antes de desplegar customer-chat.

create or replace function public.prevent_messages_in_closed_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    conversation_status text;
begin
    select status
      into conversation_status
      from public.chat_conversations
     where id = new.conversation_id
     for update;

    if conversation_status is distinct from 'open' then
        raise exception 'No se pueden agregar mensajes a una conversación cerrada o inexistente.'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists chat_messages_require_open_conversation on public.chat_messages;
create trigger chat_messages_require_open_conversation
before insert on public.chat_messages
for each row execute function public.prevent_messages_in_closed_chat();

-- NEXA — Migración 0008: Estructura preparatoria para WhatsApp / Chatbot
--
-- Solo la interfaz de bandeja de atención se implementa en el MVP (sección 22
-- del alcance). Estas tablas dejan lista la arquitectura para conectar más
-- adelante: WhatsApp → Webhook → Backend NEXA → Base de datos → Chatbot →
-- Respuesta al cliente. Por ahora se usan para simular/registrar
-- conversaciones manualmente desde la interfaz; NO hay integración real con
-- la API de WhatsApp todavía.

create type public.whatsapp_conversation_status as enum ('pendiente', 'atendida', 'cerrada');
create type public.whatsapp_message_sender as enum ('cliente', 'agente', 'bot');

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  phone_number text not null,
  status public.whatsapp_conversation_status not null default 'pendiente',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  sender public.whatsapp_message_sender not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index whatsapp_conversations_status_idx on public.whatsapp_conversations (status);
create index whatsapp_messages_conversation_id_idx on public.whatsapp_messages (conversation_id);

create trigger set_updated_at before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy whatsapp_conversations_staff on public.whatsapp_conversations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy whatsapp_messages_staff on public.whatsapp_messages
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Privilegios base explícitos (ver el mismo razonamiento en 0006): no
-- depender de los privilegios por defecto que Supabase concede al crear
-- una tabla desde su SQL Editor. Las políticas "for all" de arriba ya
-- autorizan las cuatro operaciones a cualquier staff autenticado.
grant select, insert, update, delete on public.whatsapp_conversations to authenticated;
grant select, insert, update, delete on public.whatsapp_messages to authenticated;

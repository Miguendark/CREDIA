-- NEXA — Migración 0004: Funciones auxiliares y triggers

-- =========================================================================
-- updated_at automático
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.loans
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.installments
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Generadores de códigos legibles (CLI-0001, PR-0001, PAG-0001)
-- Se usan secuencias dedicadas para evitar colisiones bajo concurrencia.
-- =========================================================================
create sequence public.client_code_seq start 1;
create sequence public.loan_number_seq start 1;
create sequence public.payment_number_seq start 1;

create or replace function public.generate_client_code()
returns trigger
language plpgsql
as $$
begin
  if new.client_code is null or btrim(new.client_code) = '' then
    new.client_code := 'CLI-' || lpad(nextval('public.client_code_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger generate_client_code before insert on public.clients
  for each row execute function public.generate_client_code();

create or replace function public.generate_loan_number()
returns trigger
language plpgsql
as $$
begin
  if new.loan_number is null or btrim(new.loan_number) = '' then
    new.loan_number := 'PR-' || lpad(nextval('public.loan_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger generate_loan_number before insert on public.loans
  for each row execute function public.generate_loan_number();

create or replace function public.generate_payment_number()
returns trigger
language plpgsql
as $$
begin
  if new.payment_number is null or btrim(new.payment_number) = '' then
    new.payment_number := 'PAG-' || lpad(nextval('public.payment_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger generate_payment_number before insert on public.payments
  for each row execute function public.generate_payment_number();

-- =========================================================================
-- Alta automática de perfil al registrar un usuario en Supabase Auth.
-- El primer usuario que se registre queda como 'admin'; el resto entra
-- como 'cobrador' por defecto y un admin debe ajustar el rol luego
-- desde Configuración > Usuarios.
-- =========================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
begin
  select count(*) = 0 into is_first_user from public.users;

  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    case when is_first_user then 'admin'::public.user_role else 'cobrador'::public.user_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================================================================
-- current_user_role(): helper usado por las políticas RLS (0006)
-- =========================================================================
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

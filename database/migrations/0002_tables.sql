-- NEXA — Migración 0002: Tablas principales

-- =========================================================================
-- users: perfil de cada miembro del staff (admin/supervisor/cobrador).
-- Clave primaria = auth.users.id, es decir, es la tabla de "perfil" de Supabase Auth.
-- =========================================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.user_role not null default 'cobrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Perfil de staff (admin/supervisor/cobrador), 1:1 con auth.users';

-- =========================================================================
-- clients
-- =========================================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  full_name text not null,
  identification_number text,
  phone text,
  whatsapp text,
  email text,
  address text,
  birth_date date,
  status public.client_status not null default 'activo',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_full_name_not_blank check (btrim(full_name) <> '')
);

-- Cédula única solo cuando está presente (permite dejarla en blanco temporalmente)
create unique index clients_identification_number_key
  on public.clients (identification_number)
  where identification_number is not null and btrim(identification_number) <> '';

comment on table public.clients is 'Clientes de la empresa de préstamos';

-- =========================================================================
-- loans
-- =========================================================================
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  loan_number text not null unique,
  client_id uuid not null references public.clients (id) on delete restrict,
  principal_amount numeric(14, 2) not null check (principal_amount > 0),
  interest_rate numeric(6, 3) not null check (interest_rate >= 0),
  interest_type public.loan_interest_type not null default 'fixed_capital',
  total_interest numeric(14, 2) not null check (total_interest >= 0),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  number_of_installments integer not null check (number_of_installments > 0),
  installment_amount numeric(14, 2) not null check (installment_amount > 0),
  frequency public.loan_frequency not null default 'monthly',
  start_date date not null,
  first_payment_date date not null,
  next_payment_date date,
  outstanding_principal numeric(14, 2) not null check (outstanding_principal >= 0),
  outstanding_interest numeric(14, 2) not null check (outstanding_interest >= 0),
  total_paid numeric(14, 2) not null default 0 check (total_paid >= 0),
  status public.loan_status not null default 'activo',
  notes text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.loans is 'Préstamos otorgados a clientes';

-- =========================================================================
-- installments (cuotas)
-- =========================================================================
create table public.installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_amount numeric(14, 2) not null check (principal_amount >= 0),
  interest_amount numeric(14, 2) not null check (interest_amount >= 0),
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  remaining_amount numeric(14, 2) not null check (remaining_amount >= 0),
  status public.installment_status not null default 'pendiente',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, installment_number)
);

comment on table public.installments is 'Cuotas generadas automáticamente al crear un préstamo';

-- =========================================================================
-- payments
-- =========================================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  client_id uuid not null references public.clients (id) on delete restrict,
  loan_id uuid not null references public.loans (id) on delete restrict,
  installment_id uuid not null references public.installments (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  principal_applied numeric(14, 2) not null default 0 check (principal_applied >= 0),
  interest_applied numeric(14, 2) not null default 0 check (interest_applied >= 0),
  payment_method public.payment_method_type not null default 'efectivo',
  payment_date date not null default current_date,
  receipt_number text,
  notes text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

comment on table public.payments is 'Ledger de pagos. Un pago que cubre varias cuotas genera una fila por cuota afectada (mismo receipt_number).';

-- =========================================================================
-- capital_transactions
-- =========================================================================
create table public.capital_transactions (
  id uuid primary key default gen_random_uuid(),
  type public.capital_transaction_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  reference_id uuid,
  transaction_date date not null default current_date,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

comment on table public.capital_transactions is 'Movimientos de capital: aporte/retiro/ajuste (manuales) y prestamo/pago (automáticos)';

-- =========================================================================
-- audit_logs
-- =========================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Bitácora de acciones críticas del sistema';

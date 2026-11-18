-- NEXA — Reversa de la migración 0014 (Finanzas fase 2: gastos e incobrables)
--
-- Elimina lo agregado por 0014_finance_expenses_writeoffs.sql y restaura
-- finance_loans y finance_projection de la 0013. No hace DELETE ni TRUNCATE.
--
-- SALVAGUARDA: si existe CUALQUIER gasto o clasificación registrada
-- (incluidos los anulados, que también son historial), el script se DETIENE
-- sin cambiar nada. Borrar las tablas haría perder esos registros. En ese
-- caso hay que decidir primero qué hacer con ellos (y respaldarlos).
--
-- Los registros de audit_logs no se borran.
--
-- No ejecutar contra producción sin respaldo previo y aprobación explícita.

begin;

do $$
declare
  v_expenses integer;
  v_writeoffs integer;
begin
  -- Bloquea las tablas para que nadie registre algo entre la revisión y el borrado.
  lock table public.expenses, public.loan_writeoffs in exclusive mode;
  select count(*) into v_expenses from public.expenses;
  select count(*) into v_writeoffs from public.loan_writeoffs;
  if v_expenses > 0 or v_writeoffs > 0 then
    raise exception 'Reversa cancelada: hay % gasto(s) y % clasificación(es) de préstamos registrados (contando los anulados). No se cambió nada.',
      v_expenses, v_writeoffs;
  end if;
end;
$$;

drop function if exists public.finance_writeoffs();
drop function if exists public.finance_expenses_total(date);
drop function if exists public.finance_expenses(date, date);
drop function if exists public.void_writeoff(uuid, text);
drop function if exists public.classify_loan(uuid, public.writeoff_kind, text, date);
drop function if exists public.void_expense(uuid, text);
drop function if exists public.register_expense(public.expense_category, numeric, text, date);

-- Versiones de la 0013 (copiadas tal cual) --------------------------------
-- Préstamos con su fecha de cancelación (NULL si no está cancelado).
create or replace function public.finance_loans()
returns table (
  id uuid,
  loan_number text,
  client_id uuid,
  frequency public.loan_frequency,
  status public.loan_status,
  start_date date,
  principal_amount numeric,
  total_interest numeric,
  cancelled_on date
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  return query
  select
    l.id,
    l.loan_number::text,
    l.client_id,
    l.frequency,
    l.status,
    l.start_date,
    l.principal_amount::numeric,
    l.total_interest::numeric,
    case when l.status = 'cancelado' then
      coalesce(
        (select min((a.created_at at time zone 'America/Santo_Domingo')::date)
           from public.audit_logs a
          where a.entity = 'loans' and a.entity_id = l.id and a.action = 'cancelar_prestamo'),
        (l.updated_at at time zone 'America/Santo_Domingo')::date
      )
    end
  from public.loans l;
end;
$$;


-- =========================================================================
-- finance_projection: lo que falta cobrar de las cuotas abiertas de
-- préstamos activos. bucket 0 = ya atrasado (vence antes de p_date);
-- bucket k = semana k (k = 1: p_date … p_date+6).
-- capital = capital de la cuota − capital ya cobrado; interés igual (exacto).
-- =========================================================================
create or replace function public.finance_projection(p_date date, p_weeks integer)
returns table (
  bucket integer,
  installments integer,
  capital numeric,
  interest numeric
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.finance_require_role();
  if p_date is null or p_weeks is null or p_weeks < 1 or p_weeks > 26 then
    raise exception 'Parámetros inválidos';
  end if;
  return query
  with open_i as (
    select ins.id, ins.due_date,
      ins.principal_amount - coalesce(sum(pm.principal_applied), 0) as cap,
      ins.interest_amount - coalesce(sum(pm.interest_applied), 0) as intr
    from public.installments ins
    join public.loans l on l.id = ins.loan_id
    left join public.payments pm on pm.installment_id = ins.id
    where l.status = 'activo' and ins.status in ('pendiente', 'parcial', 'vencida')
    group by ins.id, ins.due_date, ins.principal_amount, ins.interest_amount
    having ins.principal_amount + ins.interest_amount
      - coalesce(sum(pm.principal_applied), 0) - coalesce(sum(pm.interest_applied), 0) > 0.01
  ),
  b as (
    select case when o.due_date < p_date then 0 else ((o.due_date - p_date) / 7) + 1 end as bk, o.cap, o.intr
    from open_i o
  )
  select b.bk::integer, count(*)::integer, sum(b.cap)::numeric, sum(b.intr)::numeric
  from b
  where b.bk <= p_weeks
  group by b.bk
  order by b.bk;
end;
$$;


drop table if exists public.loan_writeoffs;
drop table if exists public.expenses;
drop type if exists public.writeoff_kind;
drop type if exists public.expense_category;

commit;

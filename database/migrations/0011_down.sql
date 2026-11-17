-- NEXA — Reversa de la migración 0011 (Fechas de pago: Día fijo + cambio de fecha de pago)
--
-- Elimina TODO lo agregado por 0011_fixed_payment_days.sql, en orden inverso,
-- y nada más. No hace DELETE ni TRUNCATE de ningún préstamo, cuota, pago ni
-- comprobante.
--
-- SALVAGUARDA: si existe algún préstamo con schedule_type = 'fixed_days', el
-- script se DETIENE sin cambiar nada. Borrar las columnas haría perder qué
-- día fijo (del mes o de la semana) tiene cada préstamo. En ese caso hay que decidir primero qué
-- hacer con esos préstamos.
--
-- Lo que esta reversa NO deshace (es dato, no esquema):
--   * Las fechas de cuotas ya reprogramadas con reschedule_loan_installments
--     se quedan como están. Las fechas anteriores quedan registradas en
--     audit_logs (action = 'cambiar_fecha_pago').
--   * Los registros de audit_logs no se borran.
--
-- No ejecutar contra producción sin respaldo previo y aprobación explícita.

begin;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.loans where schedule_type = 'fixed_days';
  if v_count > 0 then
    raise exception 'Reversa cancelada: hay % préstamo(s) con días fijos. No se cambió nada.', v_count;
  end if;
end;
$$;

drop function if exists public.reschedule_loan_installments(uuid, text, smallint[], smallint, jsonb, text);
drop function if exists public.create_loan_with_schedule(
  uuid, numeric, numeric, public.loan_interest_type, integer, numeric, numeric, numeric,
  public.loan_frequency, date, date, text, jsonb, text, smallint[], smallint
);
drop function if exists public.loan_add_period(date, public.loan_frequency, integer);
drop function if exists public.fixed_schedule_next(date, smallint[], smallint);
drop function if exists public.fixed_day_after(date, smallint[]);
drop function if exists public.fixed_schedule_error(public.loan_frequency, smallint[], smallint);

alter table public.loans drop constraint if exists loans_schedule_check;
alter table public.loans drop constraint if exists loans_schedule_type_check;
alter table public.loans drop column if exists payment_weekday;
alter table public.loans drop column if exists payment_days;
alter table public.loans drop column if exists schedule_type;

commit;

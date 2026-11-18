-- NEXA — Reversa de la migración 0013 (Finanzas, funciones de solo lectura)
--
-- Solo elimina las funciones creadas por 0013. No hay datos que perder.

begin;

drop function if exists public.finance_cancelled_loans();
drop function if exists public.finance_top_clients(date, date, integer);
drop function if exists public.finance_by_user(date, date);
drop function if exists public.finance_overdue_loans(date);
drop function if exists public.finance_projection(date, integer);
drop function if exists public.finance_monthly(date, integer);
drop function if exists public.finance_collection_efficiency(date, date);
drop function if exists public.finance_flows(date, date);
drop function if exists public.finance_cash(date);
drop function if exists public.finance_position(date);
drop function if exists public.finance_loans();
drop function if exists public.finance_require_role();

commit;

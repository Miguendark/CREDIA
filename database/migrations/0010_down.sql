-- NEXA — Reversa de la migración 0010 (Comprobante de pago / receipts)
--
-- Elimina TODO lo agregado por 0010_receipts.sql, en orden inverso, y nada
-- más: no toca ninguna tabla, función, vista, política o dato que existiera
-- antes de esa migración (payments, loans, installments, clients, etc. no
-- se ven afectados).
--
-- ADVERTENCIA: esto borra de forma permanente cualquier comprobante de pago
-- ya generado (tabla `receipts`). No borra, anula ni modifica los pagos
-- reales en `payments` — esos quedan intactos. Ejecutar solo si se decide
-- deshacer el feature de comprobantes por completo.
--
-- No ejecutar contra producción sin aprobación explícita, igual que
-- cualquier otro script de este proyecto.

drop function if exists public.void_receipt(uuid, text);
drop function if exists public.create_receipt(uuid[]);

-- drop table también elimina sus índices, políticas RLS y constraints.
drop table if exists public.receipts;

drop sequence if exists public.receipt_number_seq;

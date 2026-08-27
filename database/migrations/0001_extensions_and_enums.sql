-- NEXA — Sistema de Gestión de Préstamos
-- Migración 0001: Extensiones y tipos enumerados
-- Ejecutar en el SQL Editor de Supabase (o vía `supabase db push`) en orden numérico.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- búsqueda difusa (ILIKE) en clientes

-- Roles del staff que usa NEXA (ver sección 7 del documento de producto)
create type public.user_role as enum ('admin', 'supervisor', 'cobrador');

-- Estado de un cliente
create type public.client_status as enum ('activo', 'inactivo');

-- Estrategia de cálculo de interés de un préstamo.
-- La arquitectura está preparada para agregar más estrategias sin migrar datos:
-- ver lib/finance/loan-calculator.ts para la lógica de cada una.
--   fixed_capital      -> interés fijo calculado una sola vez sobre el capital (MVP, totalmente implementado)
--   declining_balance  -> interés sobre saldo insoluto, amortización tipo francés (MVP, totalmente implementado)
create type public.loan_interest_type as enum ('fixed_capital', 'declining_balance');

-- Frecuencia de pago de un préstamo
create type public.loan_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly');

-- Estado "duro" almacenado del préstamo. El estado "vencido" NO se almacena aquí:
-- se calcula en tiempo de consulta (status = 'activo' AND next_payment_date < CURRENT_DATE)
-- para evitar depender de un job en background que lo mantenga sincronizado.
create type public.loan_status as enum ('activo', 'pagado', 'vencido', 'cancelado');

-- Estado de una cuota. 'vencida' existe para permitir marcarla explícitamente,
-- pero la fuente de verdad para "está vencida" en listados es due_date < CURRENT_DATE
-- combinado con status IN ('pendiente','parcial'). Ver services/installments.service.ts
create type public.installment_status as enum ('pendiente', 'parcial', 'pagada', 'vencida');

-- Métodos de pago soportados inicialmente. Ampliable sin romper compatibilidad.
create type public.payment_method_type as enum ('efectivo', 'transferencia', 'deposito', 'tarjeta', 'otro');

-- Tipos de movimiento del capital de la empresa (sección 4 y 20)
create type public.capital_transaction_type as enum ('aporte', 'retiro', 'prestamo', 'pago', 'ajuste');

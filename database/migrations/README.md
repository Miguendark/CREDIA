# Migraciones de NEXA

Ejecuta estos archivos **en orden numérico** en el SQL Editor de tu proyecto de
Supabase (o cópialos a `supabase/migrations` si usas la CLI de Supabase y corre
`supabase db push`).

| Archivo | Contenido |
|---|---|
| `0001_extensions_and_enums.sql` | Extensiones (`pgcrypto`, `pg_trgm`) y tipos enumerados |
| `0002_tables.sql` | Tablas: `users`, `clients`, `loans`, `installments`, `payments`, `capital_transactions`, `audit_logs` |
| `0003_indexes.sql` | Índices de búsqueda y de rendimiento |
| `0004_functions_triggers.sql` | `updated_at` automático, generación de códigos (`CLI-`, `PR-`, `PAG-`), alta automática de perfil al registrarse |
| `0005_rpc_business_logic.sql` | Funciones RPC: `create_loan_with_installments`, `register_payment`, `register_capital_movement` |
| `0006_rls_policies.sql` | Row Level Security y privilegios de tabla |
| `0007_views.sql` | Vistas `client_summary` y `dashboard_metrics` |
| `0008_whatsapp.sql` | Tablas preparatorias para la bandeja de WhatsApp/Chatbot |
| `0009_capital_role_restriction.sql` | Capital solo para admin/supervisor (RLS + RPC) |
| `0010_receipts.sql` | Comprobantes de pago (`receipts`, `create_receipt`, `void_receipt`). Reversa: `0010_down.sql` |
| `0011_fixed_payment_days.sql` | Fechas de pago "Día fijo" según la frecuencia (`loans.schedule_type`, `loans.payment_days` para mensual/quincenal, `loans.payment_weekday` para semanal), "hoy" en hora de RD, `create_loan_with_schedule`, `reschedule_loan_installments`. Reversa: `0011_down.sql`. Pruebas: `npx tsx database/tests/0011_fixed_days.integration.mts` (solo nexa-pruebas) |
| `0012_today_rd.sql` | "Hoy" en hora de República Dominicana: función `today_rd()`, defaults de `payments.payment_date` y `capital_transactions.transaction_date`, vista `dashboard_metrics` y `register_capital_movement`. Sin cambios de datos. Reversa: `0012_down.sql`. **Producción: solo con respaldo y aprobación.** |

Ver el README principal del proyecto para la guía paso a paso de configuración
de Supabase y cómo cargar los datos de prueba (`npm run seed`).

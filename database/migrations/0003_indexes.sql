-- NEXA — Migración 0003: Índices

-- clients: búsqueda por nombre, cédula, teléfono, código
create index clients_full_name_trgm_idx on public.clients using gin (full_name gin_trgm_ops);
create index clients_identification_number_trgm_idx on public.clients using gin (identification_number gin_trgm_ops);
create index clients_phone_idx on public.clients (phone);
create index clients_status_idx on public.clients (status);

-- loans
create index loans_client_id_idx on public.loans (client_id);
create index loans_status_idx on public.loans (status);
create index loans_next_payment_date_idx on public.loans (next_payment_date);

-- installments
create index installments_loan_id_idx on public.installments (loan_id);
create index installments_status_idx on public.installments (status);
create index installments_due_date_idx on public.installments (due_date);

-- payments
create index payments_loan_id_idx on public.payments (loan_id);
create index payments_client_id_idx on public.payments (client_id);
create index payments_installment_id_idx on public.payments (installment_id);
create index payments_payment_date_idx on public.payments (payment_date);

-- capital_transactions
create index capital_transactions_type_idx on public.capital_transactions (type);
create index capital_transactions_transaction_date_idx on public.capital_transactions (transaction_date);

-- audit_logs
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

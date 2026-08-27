/**
 * Seed de datos demo para NEXA.
 *
 * Requiere que las migraciones de /database/migrations ya se hayan
 * ejecutado en el proyecto de Supabase, y que .env.local tenga
 * NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY configurados
 * (la service role key SOLO se usa aquí, en un script de servidor —
 * nunca en el navegador).
 *
 * Uso:
 *   npm run seed
 *
 * Qué crea:
 *  - 1 usuario admin de demostración (correo/clave configurables por env,
 *    con valores por defecto — cámbialos antes de usar en producción).
 *  - 5 clientes de ejemplo.
 *  - 5 préstamos que cubren los casos: activo con cuota parcial, pagado,
 *    vencido, con interés sobre saldo, y recién creado sin pagos.
 *  - Pagos que reflejan esos escenarios.
 *  - Un aporte de capital inicial de RD$50,000.
 *  - 2 conversaciones de WhatsApp de ejemplo.
 *
 * El script es idempotente en la práctica solo si la base está vacía;
 * está pensado para correrse una vez sobre un proyecto Supabase nuevo.
 */
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { addDays, subMonths } from "date-fns"

import type { Database } from "../../types/database.types"
import { createClient as createClientRecord } from "../../services/clients.service"
import { createLoan } from "../../services/loans.service"
import { registerPayment } from "../../services/payments.service"
import { registerCapitalMovement } from "../../services/capital.service"

config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@nexa.local"
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "NexaAdmin2026!"

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local. Configura tu proyecto de Supabase antes de sembrar datos (ver README)."
  )
  process.exit(1)
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const iso = (d: Date) => d.toISOString().slice(0, 10)
const today = new Date()

async function ensureAdminUser() {
  const { data: existing } = await supabase.auth.admin.listUsers()
  const found = existing.users.find((u) => u.email === SEED_ADMIN_EMAIL)
  if (found) {
    console.log(`Usuario admin ya existe: ${SEED_ADMIN_EMAIL}`)
    return
  }

  const { error } = await supabase.auth.admin.createUser({
    email: SEED_ADMIN_EMAIL,
    password: SEED_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Administrador NEXA" },
  })
  if (error) throw error
  console.log(`Usuario admin creado: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`)
}

async function seedClients() {
  const clientsData = [
    { full_name: "Juan Pérez", identification_number: "001-1234567-8", phone: "809-555-0101" },
    { full_name: "María Rodríguez", identification_number: "001-2345678-9", phone: "809-555-0102" },
    { full_name: "Pedro Gómez", identification_number: "001-3456789-0", phone: "829-555-0103" },
    { full_name: "Ana Martínez", identification_number: "001-4567890-1", phone: "849-555-0104" },
    { full_name: "Carlos Fernández", identification_number: "001-5678901-2", phone: "809-555-0105" },
  ]

  const created: Record<string, string> = {}
  for (const data of clientsData) {
    const client = await createClientRecord(supabase, {
      full_name: data.full_name,
      identification_number: data.identification_number,
      phone: data.phone,
      whatsapp: data.phone,
      address: "Santo Domingo, República Dominicana",
    })
    created[data.full_name] = client.id
    console.log(`Cliente creado: ${data.full_name} (${client.client_code})`)
  }
  return created
}

async function getPendingInstallments(loanId: string) {
  const { data, error } = await supabase
    .from("installments")
    .select("*")
    .eq("loan_id", loanId)
    .order("installment_number", { ascending: true })
  if (error) throw error
  return data
}

async function payFullInstallment(clientId: string, loanId: string, installmentNumber: number) {
  const installments = await getPendingInstallments(loanId)
  const target = installments.find((i) => i.installment_number === installmentNumber)
  if (!target) return
  await registerPayment(supabase, {
    client_id: clientId,
    loan_id: loanId,
    installment_id: target.id,
    amount: target.remaining_amount,
    payment_method: "efectivo",
    payment_date: iso(today),
    receipt_number: `SEED-${loanId.slice(0, 8)}-${installmentNumber}`,
  })
}

async function payPartialInstallment(clientId: string, loanId: string, installmentNumber: number, amount: number) {
  const installments = await getPendingInstallments(loanId)
  const target = installments.find((i) => i.installment_number === installmentNumber)
  if (!target) return
  await registerPayment(supabase, {
    client_id: clientId,
    loan_id: loanId,
    installment_id: target.id,
    amount,
    payment_method: "transferencia",
    payment_date: iso(today),
    receipt_number: `SEED-${loanId.slice(0, 8)}-${installmentNumber}-parcial`,
  })
}

async function seedLoans(clientIds: Record<string, string>) {
  // Juan Pérez — activo, cuota #1 pagada, cuota #2 parcial (y vencida, porque su fecha ya pasó)
  const loanJuan = await createLoan(supabase, {
    client_id: clientIds["Juan Pérez"],
    principal_amount: 5000,
    interest_type: "fixed_capital",
    interest_rate: 10,
    number_of_installments: 5,
    frequency: "monthly",
    start_date: iso(subMonths(today, 3)),
    first_payment_date: iso(subMonths(today, 2)),
    notes: "Préstamo de ejemplo — activo con historial mixto de pagos",
  })
  await payFullInstallment(clientIds["Juan Pérez"], loanJuan.id, 1)
  const installmentsJuan = await getPendingInstallments(loanJuan.id)
  const cuota2 = installmentsJuan.find((i) => i.installment_number === 2)
  if (cuota2) await payPartialInstallment(clientIds["Juan Pérez"], loanJuan.id, 2, Math.round(cuota2.total_amount / 2))
  console.log(`Préstamo creado para Juan Pérez: ${loanJuan.loan_number}`)

  // María Rodríguez — pagado en su totalidad
  const loanMaria = await createLoan(supabase, {
    client_id: clientIds["María Rodríguez"],
    principal_amount: 8000,
    interest_type: "fixed_capital",
    interest_rate: 12,
    number_of_installments: 4,
    frequency: "monthly",
    start_date: iso(subMonths(today, 5)),
    first_payment_date: iso(subMonths(today, 4)),
    notes: "Préstamo de ejemplo — pagado en su totalidad",
  })
  for (let n = 1; n <= 4; n++) {
    await payFullInstallment(clientIds["María Rodríguez"], loanMaria.id, n)
  }
  console.log(`Préstamo creado para María Rodríguez: ${loanMaria.loan_number} (pagado)`)

  // Pedro Gómez — vencido, sin pagos
  const loanPedro = await createLoan(supabase, {
    client_id: clientIds["Pedro Gómez"],
    principal_amount: 3000,
    interest_type: "fixed_capital",
    interest_rate: 8,
    number_of_installments: 3,
    frequency: "monthly",
    start_date: iso(subMonths(today, 2)),
    first_payment_date: iso(subMonths(today, 1)),
    notes: "Préstamo de ejemplo — con cuota vencida sin pagos",
  })
  console.log(`Préstamo creado para Pedro Gómez: ${loanPedro.loan_number} (vencido)`)

  // Ana Martínez — interés sobre saldo insoluto, con un pago
  const loanAna = await createLoan(supabase, {
    client_id: clientIds["Ana Martínez"],
    principal_amount: 10000,
    interest_type: "declining_balance",
    interest_rate: 3,
    number_of_installments: 6,
    frequency: "monthly",
    start_date: iso(subMonths(today, 2)),
    first_payment_date: iso(subMonths(today, 1)),
    notes: "Préstamo de ejemplo — interés sobre saldo insoluto",
  })
  await payFullInstallment(clientIds["Ana Martínez"], loanAna.id, 1)
  console.log(`Préstamo creado para Ana Martínez: ${loanAna.loan_number} (saldo insoluto)`)

  // Carlos Fernández — recién creado, quincenal, sin pagos todavía
  const loanCarlos = await createLoan(supabase, {
    client_id: clientIds["Carlos Fernández"],
    principal_amount: 2000,
    interest_type: "fixed_capital",
    interest_rate: 10,
    number_of_installments: 4,
    frequency: "biweekly",
    start_date: iso(today),
    first_payment_date: iso(addDays(today, 14)),
    notes: "Préstamo de ejemplo — recién otorgado",
  })
  console.log(`Préstamo creado para Carlos Fernández: ${loanCarlos.loan_number} (nuevo)`)
}

async function seedCapital() {
  await registerCapitalMovement(supabase, {
    type: "aporte",
    amount: 50000,
    description: "Capital inicial de la empresa (seed demo)",
    transaction_date: iso(subMonths(today, 6)),
  })
  console.log("Aporte de capital inicial registrado: RD$50,000")
}

async function seedWhatsapp(clientIds: Record<string, string>) {
  const { data: conversation, error } = await supabase
    .from("whatsapp_conversations")
    .insert({ client_id: clientIds["Juan Pérez"], phone_number: "809-555-0101", status: "pendiente" })
    .select()
    .single()
  if (error) throw error

  await supabase.from("whatsapp_messages").insert([
    { conversation_id: conversation.id, sender: "cliente", content: "Hola, ¿cuál es mi próximo pago?" },
  ])

  const { data: conversation2, error: error2 } = await supabase
    .from("whatsapp_conversations")
    .insert({ client_id: clientIds["Pedro Gómez"], phone_number: "829-555-0103", status: "atendida" })
    .select()
    .single()
  if (error2) throw error2

  await supabase.from("whatsapp_messages").insert([
    { conversation_id: conversation2.id, sender: "cliente", content: "Buenas, quiero saber mi saldo pendiente." },
    { conversation_id: conversation2.id, sender: "agente", content: "Hola Pedro, tu cuota #1 está vencida. Te comparto los detalles por aquí." },
  ])

  console.log("Conversaciones de WhatsApp de ejemplo creadas")
}

async function main() {
  console.log("Sembrando datos demo de NEXA...\n")
  await ensureAdminUser()
  await seedCapital()
  const clientIds = await seedClients()
  await seedLoans(clientIds)
  await seedWhatsapp(clientIds)
  console.log("\nListo. Inicia sesión con:")
  console.log(`  Correo:    ${SEED_ADMIN_EMAIL}`)
  console.log(`  Contraseña: ${SEED_ADMIN_PASSWORD}`)
}

main().catch((error) => {
  console.error("\nError sembrando datos:", error)
  process.exit(1)
})

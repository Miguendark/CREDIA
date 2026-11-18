/**
 * Pruebas de integración de Finanzas (migraciones 0013 y 0014) contra nexa-pruebas.
 *
 *   npx tsx database/tests/finance.integration.mts
 *
 * - Lee SOLO .env.pruebas.local y se detiene si la URL no es nexa-pruebas.
 * - Escenario exacto: crea (una sola vez) préstamos "QA FIN 2020" fechados en
 *   2020, un año sin otros datos, y verifica cifras calculadas a mano.
 * - Cuadres globales: compara las funciones con cálculos independientes hechos
 *   aquí a partir de las filas crudas (service role).
 * - Fase 2: gastos, clasificación de préstamos y permisos. Los datos QA de
 *   corridas anteriores se ANULAN (no se borran) al empezar.
 * - Nunca hace DELETE ni TRUNCATE.
 */
import { config } from "dotenv"
import { randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { calculateLoan } from "../../lib/finance/loan-calculator.ts"
import { allocatePayment } from "../../lib/finance/payment-allocator.ts"
import { todayRD, addDaysIso } from "../../lib/utils/date.ts"
import { resolvePeriod } from "../../lib/finance/periods.ts"
import { getFinanceDashboard } from "../../services/finance.service.ts"

const PRUEBAS_ID = "iygdktkuafnujsapudtl"
config({ path: ".env.pruebas.local", override: true, quiet: true })
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
if (!URL_.includes(PRUEBAS_ID) || URL_.includes("bwgj")) {
  console.error(`DETENIDO: la URL no es nexa-pruebas (${PRUEBAS_ID}). No se ejecuta nada.`)
  process.exit(2)
}
console.log(`Proyecto verificado: ${PRUEBAS_ID} (nexa-pruebas)\n`)

const opts = { auth: { autoRefreshToken: false, persistSession: false } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>
const service: Db = createClient(URL_, SERVICE, opts)
const anon: Db = createClient(URL_, ANON, opts)

let passed = 0
let failed = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { passed++; console.log(`  ✔ ${name}`) } else { failed++; console.log(`  ✖ ${name}`, extra ?? "") }
}
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol
function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}
const num = (v: unknown) => Number(v ?? 0)
const sum = <T,>(rows: T[], f: (r: T) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100

// ---------- Usuarios QA ----------
async function qaUser(role: "admin" | "supervisor" | "cobrador"): Promise<{ db: Db; id: string }> {
  const email = `qa.${role}.0011@pruebas.com`
  const password = randomBytes(18).toString("base64url") + "aA1!"
  const list = must(await service.auth.admin.listUsers({ perPage: 1000 }), "listUsers")
  let user = list.users.find((u) => u.email === email)
  if (user) must(await service.auth.admin.updateUserById(user.id, { password }), "updateUser")
  else user = must(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `QA 0011 ${role}` } }), "createUser").user!
  must(await service.from("users").update({ role }).eq("id", user.id).select("id").single(), `rol ${role}`)
  const db: Db = createClient(URL_, ANON, opts)
  must(await db.auth.signInWithPassword({ email, password }), `login ${role}`)
  return { db, id: user.id }
}
const { db: admin, id: adminId } = await qaUser("admin")
const { db: supervisor } = await qaUser("supervisor")
const { db: cobrador } = await qaUser("cobrador")

const rpc = async <T,>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> => must(await db.rpc(fn, args), fn) as T

// ===== Seguridad =====
console.log("A. Seguridad")
{
  const r1 = await cobrador.rpc("finance_cash", { p_date: "2026-01-01" })
  check(`cobrador recibe error → "${r1.error?.message}"`, !!r1.error && /admin o supervisor/.test(r1.error.message))
  const r2 = await anon.rpc("finance_position", { p_date: "2026-01-01" })
  check(`anon no puede ejecutar → "${r2.error?.message}"`, !!r2.error && /permission denied|JWT|not find/i.test(r2.error.message))
  const r3 = await cobrador.rpc("finance_loans")
  check("cobrador tampoco puede leer el helper finance_loans", !!r3.error)
  const r4 = await supervisor.rpc("finance_cash", { p_date: "2026-01-01" })
  check("supervisor sí puede", !r4.error, r4.error?.message)
  const r5 = await admin.rpc("finance_flows", { p_from: "2026-02-01", p_to: "2026-01-01" })
  check("período invertido se rechaza", !!r5.error && /Período inválido/.test(r5.error.message))
}

// ===== Escenario exacto 2020 =====
console.log("\nB. Escenario exacto (préstamos QA FIN 2020)")
const NOTE = "QA FIN 2020"
let clientRow = must(await service.from("clients").select("id").eq("full_name", "QA FIN Cliente").maybeSingle(), "cliente")
if (!clientRow) clientRow = must(await admin.from("clients").insert({ full_name: "QA FIN Cliente" }).select("id").single(), "crear cliente")
const clientId = clientRow.id as string

{
  const other2020 = must(await service.from("loans").select("id, notes").gte("start_date", "2019-01-01").lte("start_date", "2020-12-31"), "2020")
  check("en 2019-2020 solo hay datos QA FIN (precondición del escenario)", other2020.every((l) => l.notes === NOTE), other2020.length)
}

interface Opts { principal: number; rate: number; n: number; freq: "weekly" | "monthly"; start: string; first: string }
async function createLoan(o: Opts): Promise<string> {
  const calc = calculateLoan({ principal: o.principal, interestRate: o.rate, interestType: "fixed_capital", numberOfInstallments: o.n, frequency: o.freq, firstPaymentDate: o.first })
  const loan = must(await admin.rpc("create_loan_with_installments", {
    p_client_id: clientId, p_principal_amount: o.principal, p_interest_rate: o.rate, p_interest_type: "fixed_capital",
    p_number_of_installments: o.n, p_installment_amount: calc.installmentAmount, p_total_interest: calc.totalInterest,
    p_total_amount: calc.totalAmount, p_frequency: o.freq, p_start_date: o.start, p_first_payment_date: o.first, p_notes: NOTE,
    p_installments: calc.installments.map((i) => ({ installment_number: i.installmentNumber, due_date: i.dueDate, principal_amount: i.principalAmount, interest_amount: i.interestAmount, total_amount: i.totalAmount })),
  }), "crear préstamo") as { id: string }
  return loan.id
}
async function pay(loanId: string, amount: number, date: string) {
  const open = must(await service.from("installments").select("*").eq("loan_id", loanId).in("status", ["pendiente", "parcial"]).order("installment_number"), "cuotas")
  const { allocations } = allocatePayment(open.map((i) => ({ id: i.id, installmentNumber: i.installment_number, interestAmount: num(i.interest_amount), totalAmount: num(i.total_amount), remainingAmount: num(i.remaining_amount) })), amount)
  must(await admin.rpc("register_payment", {
    p_loan_id: loanId, p_client_id: clientId, p_payment_method: "efectivo", p_payment_date: date, p_receipt_number: null, p_notes: NOTE,
    p_allocations: allocations.map((a) => ({ installment_id: a.installmentId, amount: a.amount, principal_applied: a.principalApplied, interest_applied: a.interestApplied })),
  }), `pago ${date}`)
}

let scenario = must(await service.from("loans").select("id, frequency, status").eq("notes", NOTE).order("start_date"), "escenario")
if (scenario.length === 0) {
  console.log("     Creando escenario (solo la primera vez)…")
  // A: mensual 10,000 al 20 % en 4 cuotas → cada cuota 2,500 capital + 500 interés
  const a = await createLoan({ principal: 10_000, rate: 20, n: 4, freq: "monthly", start: "2020-01-10", first: "2020-02-10" })
  // B: semanal 6,000 al 10 % en 3 cuotas → cada cuota 2,000 capital + 200 interés
  const b = await createLoan({ principal: 6_000, rate: 10, n: 3, freq: "weekly", start: "2020-03-01", first: "2020-03-08" })
  await pay(a, 3_000, "2020-02-10") // cuota 1 completa: 2,500 + 500
  await pay(a, 1_500, "2020-03-15") // mitad de la cuota 2: 1,250 + 250
  await pay(b, 2_200, "2020-03-08") // cuota 1 completa: 2,000 + 200
  // B se cancela "el 1 de abril de 2020" (auditoría con esa fecha).
  must(await service.from("loans").update({ status: "cancelado" }).eq("id", b).select("id"), "cancelar B")
  must(await service.from("audit_logs").insert({ user_id: adminId, action: "cancelar_prestamo", entity: "loans", entity_id: b, description: `${NOTE}: cancelado`, created_at: "2020-04-01T16:00:00Z" }).select("id"), "auditoría B")
  // A se cancela hoy, igual que lo hace la app (no afecta 2020 y lo saca de la cartera actual).
  must(await admin.from("loans").update({ status: "cancelado" }).eq("id", a).select("id"), "cancelar A")
  must(await admin.from("audit_logs").insert({ user_id: adminId, action: "cancelar_prestamo", entity: "loans", entity_id: a, description: `${NOTE}: cancelado` }).select("id"), "auditoría A")
  scenario = must(await service.from("loans").select("id, frequency, status").eq("notes", NOTE).order("start_date"), "escenario")
}
check("escenario: 2 préstamos cancelados", scenario.length === 2 && scenario.every((l) => l.status === "cancelado"))
type Pos = { frequency: string; active_loans: number; capital_outstanding: number; interest_outstanding: number }
const posTotal = (rows: Pos[]) => ({ cap: sum(rows, (r) => num(r.capital_outstanding)), int: sum(rows, (r) => num(r.interest_outstanding)), n: sum(rows, (r) => num(r.active_loans)) })

// Caso PR-00017: la última cuota se cobra con 1 centavo de menos y queda
// "pagada" por la tolerancia; el préstamo queda "pagado" con RD$0.01 de saldo.
const CENT_NOTE = "QA FIN CENTAVO"
let centLoan = must(await service.from("loans").select("id, status, outstanding_principal, outstanding_interest").eq("notes", CENT_NOTE).maybeSingle(), "centavo")
if (!centLoan) {
  const id = await (async () => {
    const calc = calculateLoan({ principal: 1_000, interestRate: 10, interestType: "fixed_capital", numberOfInstallments: 1, frequency: "monthly", firstPaymentDate: "2021-02-10" })
    const loan = must(await admin.rpc("create_loan_with_installments", {
      p_client_id: clientId, p_principal_amount: 1_000, p_interest_rate: 10, p_interest_type: "fixed_capital",
      p_number_of_installments: 1, p_installment_amount: calc.installmentAmount, p_total_interest: calc.totalInterest,
      p_total_amount: calc.totalAmount, p_frequency: "monthly", p_start_date: "2021-01-10", p_first_payment_date: "2021-02-10", p_notes: CENT_NOTE,
      p_installments: calc.installments.map((i) => ({ installment_number: i.installmentNumber, due_date: i.dueDate, principal_amount: i.principalAmount, interest_amount: i.interestAmount, total_amount: i.totalAmount })),
    }), "crear préstamo centavo") as { id: string }
    return loan.id
  })()
  const inst = must(await service.from("installments").select("total_amount").eq("loan_id", id).single(), "cuota centavo")
  await pay(id, Math.round((num(inst.total_amount) - 0.01) * 100) / 100, "2021-02-10")
  centLoan = must(await service.from("loans").select("id, status, outstanding_principal, outstanding_interest").eq("id", id).single(), "centavo")
}
{
  const left = Math.round((num(centLoan!.outstanding_principal) + num(centLoan!.outstanding_interest)) * 100) / 100
  check(`centavo: el préstamo quedó "pagado" con RD$0.01 de saldo (como PR-00017) → ${centLoan!.status} / ${left}`, centLoan!.status === "pagado" && left === 0.01)
  const before = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-01-09" }))
  const during = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-01-20" }))
  const after = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-03-01" }))
  check(`centavo: mientras se debía cuenta como activo (+1) → ${during.n - before.n}`, during.n - before.n === 1)
  check(`centavo: después del pago NO suma a la cartera ni cuenta como activo → +${Math.round((after.cap + after.int - before.cap - before.int) * 100) / 100} / +${after.n - before.n}`,
    after.n === before.n && near(after.cap, before.cap, 0.001) && near(after.int, before.int, 0.001))
  const late = await rpc<{ loan_id: string }[]>(admin, "finance_overdue_loans", { p_date: "2021-03-01" })
  check("centavo: la cuota con 1 centavo pendiente NO está atrasada", !late.some((r) => r.loan_id === centLoan!.id))
  const e = (await rpc<{ installments_due: number; installments_paid: number }[]>(admin, "finance_collection_efficiency", { p_from: "2021-02-10", p_to: "2021-02-10" }))[0]
  check(`centavo: la cuota cuenta como pagada completa → ${e.installments_paid} de ${e.installments_due}`, num(e.installments_due) >= 1 && num(e.installments_paid) === num(e.installments_due))
}

{
  const p = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2020-03-20" }))
  check(`cartera al 20/03/2020: capital 10,250 (6,250 + 4,000) → ${p.cap}`, p.cap === 10_250)
  check(`cartera al 20/03/2020: interés por cobrar 1,650 (1,250 + 400) → ${p.int}`, p.int === 1_650)
  check(`cartera al 20/03/2020: 2 activos → ${p.n}`, p.n === 2)
  const p2 = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2020-04-05" }))
  check(`al 05/04/2020 B ya está cancelado: capital 6,250 → ${p2.cap}`, p2.cap === 6_250 && p2.int === 1_250)
  const p0 = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2020-01-09" }))
  check("antes del primer préstamo: 0", p0.cap === 0 && p0.n === 0)
}
type Flow = { frequency: string; interest_collected: number; principal_collected: number; operations: number; disbursed: number; new_loans: number; paid_loans: number; avg_capital: number }
{
  const f = await rpc<Flow[]>(admin, "finance_flows", { p_from: "2020-02-01", p_to: "2020-02-29" })
  const m = f.find((r) => r.frequency === "monthly")!
  check(`febrero 2020: ganancia 500, capital 2,500, 1 pago → ${m.interest_collected}/${m.principal_collected}/${m.operations}`,
    num(m.interest_collected) === 500 && num(m.principal_collected) === 2_500 && num(m.operations) === 1)
  const expectedAvg = Math.round(((10_000 * 29 - 2_500 * 20) / 29) * 100) / 100
  check(`febrero 2020: capital promedio (10,000×29 − 2,500×20)/29 = ${expectedAvg} → ${m.avg_capital}`, num(m.avg_capital) === expectedAvg)
  const y = await rpc<Flow[]>(admin, "finance_flows", { p_from: "2020-01-01", p_to: "2020-12-31" })
  check(`año 2020: ganancia 950 (500 + 250 + 200) → ${sum(y, (r) => num(r.interest_collected))}`, sum(y, (r) => num(r.interest_collected)) === 950)
  check(`año 2020: capital recuperado 5,750 → ${sum(y, (r) => num(r.principal_collected))}`, sum(y, (r) => num(r.principal_collected)) === 5_750)
  check(`año 2020: desembolsado 16,000, 2 nuevos, 3 pagos, 0 pagados`,
    sum(y, (r) => num(r.disbursed)) === 16_000 && sum(y, (r) => num(r.new_loans)) === 2 && sum(y, (r) => num(r.operations)) === 3 && sum(y, (r) => num(r.paid_loans)) === 0)
}
{
  const e = (await rpc<{ due_amount: number; collected_amount: number; installments_due: number; installments_paid: number }[]>(admin, "finance_collection_efficiency", { p_from: "2020-03-01", p_to: "2020-03-31" }))[0]
  check(`marzo 2020: tocaba 9,600 (3,000 + 3×2,200), se cobró 3,700 → ${e.due_amount}/${e.collected_amount}`, num(e.due_amount) === 9_600 && num(e.collected_amount) === 3_700)
  check("marzo 2020: 4 cuotas, 1 pagada completa", num(e.installments_due) === 4 && num(e.installments_paid) === 1)
}
{
  const o = await rpc<{ loan_number: string; days_late: number; capital_at_risk: number; overdue_amount: number; frequency: string }[]>(admin, "finance_overdue_loans", { p_date: "2020-03-20" })
  const a = o.find((r) => r.frequency === "monthly")
  const b = o.find((r) => r.frequency === "weekly")
  check(`atraso al 20/03/2020: A 10 días, riesgo 6,250, vencido 1,500 → ${a?.days_late}/${a?.capital_at_risk}/${a?.overdue_amount}`,
    !!a && num(a.days_late) === 10 && num(a.capital_at_risk) === 6_250 && num(a.overdue_amount) === 1_500)
  check(`atraso al 20/03/2020: B 5 días, riesgo 4,000, vencido 2,200 → ${b?.days_late}/${b?.capital_at_risk}/${b?.overdue_amount}`,
    !!b && num(b.days_late) === 5 && num(b.capital_at_risk) === 4_000 && num(b.overdue_amount) === 2_200)
  const before = await rpc<unknown[]>(admin, "finance_overdue_loans", { p_date: "2020-02-10" })
  check("el mismo día del vencimiento no cuenta como atraso", before.length === 0)
}
{
  const m = await rpc<{ month_start: string; interest_collected: number; principal_collected: number; disbursed: number }[]>(admin, "finance_monthly", { p_to: "2020-12-31", p_months: 12 })
  const byMonth = Object.fromEntries(m.map((r) => [String(r.month_start).slice(0, 7), r]))
  check("serie 2020: 12 meses, de enero a diciembre", m.length === 12 && String(m[0].month_start).startsWith("2020-01") && String(m[11].month_start).startsWith("2020-12"))
  check("serie 2020: ene desembolso 10,000; feb ganancia 500; mar ganancia 450 y desembolso 6,000",
    num(byMonth["2020-01"].disbursed) === 10_000 && num(byMonth["2020-02"].interest_collected) === 500 &&
    num(byMonth["2020-03"].interest_collected) === 450 && num(byMonth["2020-03"].disbursed) === 6_000)
}
{
  const u = await rpc<{ user_id: string; collected: number; operations: number }[]>(admin, "finance_by_user", { p_from: "2020-01-01", p_to: "2020-12-31" })
  check(`por usuario 2020: QA admin cobró 6,700 en 3 pagos`, u.length === 1 && u[0].user_id === adminId && num(u[0].collected) === 6_700 && num(u[0].operations) === 3)
  const t = await rpc<{ client_id: string; interest: number; loans: number }[]>(admin, "finance_top_clients", { p_from: "2020-01-01", p_to: "2020-12-31", p_limit: 5 })
  check("mejores clientes 2020: QA FIN Cliente, 950 de ganancia, 2 préstamos", t.length === 1 && t[0].client_id === clientId && num(t[0].interest) === 950 && num(t[0].loans) === 2)
}
{
  const c0 = num(await rpc(admin, "finance_cash", { p_date: "2019-12-31" }))
  const c1 = num(await rpc(admin, "finance_cash", { p_date: "2020-03-31" }))
  check(`caja: 2020-03-31 − 2019-12-31 = −10,000 + 3,000 − 6,000 + 2,200 + 1,500 = −9,300 → ${Math.round((c1 - c0) * 100) / 100}`, near(c1 - c0, -9_300))
}
{
  type Cx = { loan_id: string; cancelled_on: string; principal_collected: number; interest_collected: number; payments: number; capital_lost: number }
  const cx = await rpc<Cx[]>(admin, "finance_cancelled_loans", {})
  const byId = new Map(cx.map((c) => [c.loan_id, c]))
  const a = byId.get(scenario.find((l) => l.frequency === "monthly")!.id)
  const b = byId.get(scenario.find((l) => l.frequency === "weekly")!.id)
  check(`cancelado A: cobró capital 3,750 en 2 pagos, no recuperado 6,250 → ${a?.principal_collected}/${a?.payments}/${a?.capital_lost}`,
    !!a && num(a.principal_collected) === 3_750 && num(a.payments) === 2 && num(a.capital_lost) === 6_250)
  check(`cancelado B: cobró capital 2,000 + interés 200, no recuperado 4,000, cancelado el 2020-04-01 → ${b?.capital_lost} / ${String(b?.cancelled_on).slice(0, 10)}`,
    !!b && num(b.principal_collected) === 2_000 && num(b.interest_collected) === 200 && num(b.capital_lost) === 4_000 && String(b.cancelled_on).startsWith("2020-04-01"))
  const rc = await cobrador.rpc("finance_cancelled_loans")
  const ra = await anon.rpc("finance_cancelled_loans")
  check("cobrador y anon no pueden ver los cancelados", !!rc.error && !!ra.error)
}

// ===== Fase 2: gastos e incobrables (migración 0014) =====
console.log("\nE. Gastos e incobrables (fase 2)")
const today0 = todayRD()
const loanA = scenario.find((l) => l.frequency === "monthly")!.id // cancelado hoy
const loanB = scenario.find((l) => l.frequency === "weekly")!.id // cancelado el 2020-04-01
// Préstamo activo QA (2021, sin pagos) para "Marcar incobrable".
const ACTIVE_NOTE = "QA FIN ACTIVO"
let activeLoan = must(await service.from("loans").select("id, status, start_date").eq("notes", ACTIVE_NOTE).maybeSingle(), "activo QA")
if (!activeLoan) {
  console.log("     Creando préstamo activo QA (solo la primera vez)…")
  const calc = calculateLoan({ principal: 2_000, interestRate: 10, interestType: "fixed_capital", numberOfInstallments: 2, frequency: "monthly", firstPaymentDate: "2021-06-01" })
  must(await admin.rpc("create_loan_with_installments", {
    p_client_id: clientId, p_principal_amount: 2_000, p_interest_rate: 10, p_interest_type: "fixed_capital",
    p_number_of_installments: 2, p_installment_amount: calc.installmentAmount, p_total_interest: calc.totalInterest,
    p_total_amount: calc.totalAmount, p_frequency: "monthly", p_start_date: "2021-05-01", p_first_payment_date: "2021-06-01", p_notes: ACTIVE_NOTE,
    p_installments: calc.installments.map((i) => ({ installment_number: i.installmentNumber, due_date: i.dueDate, principal_amount: i.principalAmount, interest_amount: i.interestAmount, total_amount: i.totalAmount })),
  }), "crear activo QA")
  activeLoan = must(await service.from("loans").select("id, status, start_date").eq("notes", ACTIVE_NOTE).single(), "activo QA")
}
const activeId = activeLoan!.id as string
const qaLoanIds = [loanA, loanB, activeId, centLoan!.id as string]

// Reinicio idempotente: se ANULAN (no se borran) las clasificaciones y gastos QA de corridas anteriores.
for (const w of must(await service.from("loan_writeoffs").select("id").is("voided_at", null).in("loan_id", qaLoanIds), "writeoffs previos")) {
  must(await admin.rpc("void_writeoff", { p_writeoff_id: w.id, p_reason: "QA: reinicio de la prueba" }), "reinicio writeoff")
}
for (const e of must(await service.from("expenses").select("id").is("voided_at", null).like("description", "QA FIN%"), "gastos previos")) {
  must(await admin.rpc("void_expense", { p_expense_id: e.id, p_reason: "QA: reinicio de la prueba" }), "reinicio gasto")
}

const expense = (db: Db, category: string, amount: number, date: string, description: string | null) =>
  db.rpc("register_expense", { p_category: category, p_amount: amount, p_description: description, p_expense_date: date })
{
  const r1 = await expense(cobrador, "sueldos", 100, "2020-03-10", "QA FIN cobrador")
  check(`gasto: cobrador no puede registrar → "${r1.error?.message}"`, !!r1.error && /admin o supervisor/.test(r1.error.message))
  const r2 = await expense(anon, "sueldos", 100, "2020-03-10", "QA FIN anon")
  check("gasto: anon no puede registrar", !!r2.error)
  const g1 = await expense(supervisor, "gasolina_transporte", 300, "2020-03-10", "QA FIN gasolina")
  check("gasto: supervisor registra RD$300 de gasolina", !g1.error, g1.error?.message)
  const g2 = await expense(admin, "sueldos", 1_000, "2020-03-20", "QA FIN sueldo")
  check("gasto: admin registra RD$1,000 de sueldos", !g2.error, g2.error?.message)
  const g3 = await expense(admin, "otros", 50, "2020-03-25", "QA FIN otro (se anula)")
  check("gasto: admin registra RD$50 de otros", !g3.error, g3.error?.message)
  const g3id = (g3.data as { id: string } | null)?.id ?? ""
  const v1 = await supervisor.rpc("void_expense", { p_expense_id: g3id, p_reason: "QA: no debe poder" })
  check(`gasto: supervisor NO puede anular → "${v1.error?.message}"`, !!v1.error && /Solo un admin/.test(v1.error.message))
  const v0 = await admin.rpc("void_expense", { p_expense_id: g3id, p_reason: "  " })
  check("gasto: anular sin motivo se rechaza", !!v0.error && /motivo/.test(v0.error.message))
  const v2 = await admin.rpc("void_expense", { p_expense_id: g3id, p_reason: "QA: registrado por error" })
  check("gasto: admin anula con motivo", !v2.error && !!(v2.data as { voided_at: string | null })?.voided_at, v2.error?.message)
  const v3 = await admin.rpc("void_expense", { p_expense_id: g3id, p_reason: "QA: otra vez" })
  check("gasto: no se anula dos veces", !!v3.error && /ya está anulado/.test(v3.error.message))
  const bad = [
    await expense(admin, "sueldos", 100, addDaysIso(today0, 1), "QA FIN futuro"),
    await expense(admin, "otros", 100, "2020-03-10", null),
    await expense(admin, "sueldos", 0, "2020-03-10", "QA FIN cero"),
    await expense(admin, "sueldos", 10.555, "2020-03-10", "QA FIN decimales"),
  ]
  check(`gasto: se rechazan fecha futura, "Otros" sin descripción, monto 0 y 3 decimales → ${bad.map((b) => (b.error ? "✓" : "✗")).join("")}`, bad.every((b) => !!b.error))
  const ins = await admin.from("expenses").insert({ category: "sueldos", amount: 1, expense_date: "2020-03-10", description: "QA FIN directo" })
  check("gasto: nadie inserta directo en la tabla (solo por la función)", !!ins.error)
  const upd = await admin.from("loan_writeoffs").update({ reason: "x" }).eq("loan_id", loanB).select("id")
  check("clasificación: nadie modifica directo la tabla", !!upd.error || (upd.data ?? []).length === 0)
  const sel = await cobrador.from("expenses").select("id").limit(1)
  check("gasto: el cobrador no ve gastos (RLS)", (sel.data ?? []).length === 0)

  type Ex = { id: string; amount: number; voided_at: string | null; void_reason: string | null; created_by_name: string }
  const mine = new Set([g1, g2, g3].map((g) => (g.data as { id: string } | null)?.id))
  const list = (await rpc<Ex[]>(admin, "finance_expenses", { p_from: "2020-03-01", p_to: "2020-03-31" })).filter((x) => mine.has(x.id))
  check(`gastos de marzo 2020: 3 registrados (1 anulado), vigentes 1,300 → ${list.length} / ${sum(list.filter((e) => !e.voided_at), (e) => num(e.amount))}`,
    list.length === 3 && sum(list.filter((e) => !e.voided_at), (e) => num(e.amount)) === 1_300)
  const t0 = num(await rpc(admin, "finance_expenses_total", { p_date: "2020-02-29" }))
  const t1 = num(await rpc(admin, "finance_expenses_total", { p_date: "2020-03-31" }))
  check(`total de gastos hasta el 31/03/2020 − hasta el 29/02/2020 = 1,300 → ${t1 - t0}`, near(t1 - t0, 1_300))
  const audit = must(await service.from("audit_logs").select("action").eq("entity", "expenses").eq("entity_id", (g2.data as { id: string }).id), "auditoría gasto")
  check("gasto: queda en auditoría", audit.some((a) => a.action === "registrar_gasto"))
  const cap = must(await service.from("capital_transactions").select("id").ilike("description", "%QA FIN%"), "capital QA")
  check("gasto: no crea movimientos de Capital", cap.length === 0)
}

const classify = (db: Db, loan: string, kind: string, date: string, reason: string) =>
  db.rpc("classify_loan", { p_loan_id: loan, p_kind: kind, p_reason: reason, p_writeoff_date: date })
{
  const s1 = await classify(supervisor, loanB, "incobrable", "2020-04-01", "QA FIN: no responde")
  check(`clasificar: supervisor NO puede → "${s1.error?.message}"`, !!s1.error && /Solo un admin/.test(s1.error.message))
  const s2 = await classify(admin, loanB, "incobrable", "2020-04-01", " ")
  check("clasificar: sin motivo se rechaza", !!s2.error && /motivo/.test(s2.error.message))
  const b = await classify(admin, loanB, "incobrable", "2020-04-01", "QA FIN: no responde")
  const bw = b.data as { capital_lost: number; interest_lost: number } | null
  check(`clasificar B incobrable: no recuperado 4,000 de capital y 400 de interés → ${bw?.capital_lost} / ${bw?.interest_lost}`,
    !b.error && num(bw?.capital_lost) === 4_000 && num(bw?.interest_lost) === 400, b.error?.message)
  const again = await classify(admin, loanB, "error", "2020-04-01", "QA FIN: otra vez")
  check("clasificar: un préstamo no se clasifica dos veces", !!again.error && /ya está clasificado/.test(again.error.message))
  const loanBRow = must(await service.from("loans").select("status, outstanding_principal").eq("id", loanB).single(), "B")
  check("clasificar: el préstamo no cambia (sigue cancelado, mismo saldo)", loanBRow.status === "cancelado" && num(loanBRow.outstanding_principal) === 4_000)
  const a = await classify(admin, loanA, "error", today0, "QA FIN: creado por error")
  check("clasificar A como error", !a.error, a.error?.message)
  const paid = await classify(admin, centLoan!.id, "incobrable", today0, "QA FIN: pagado")
  check("clasificar: un préstamo pagado no se clasifica", !!paid.error && /pagado/.test(paid.error.message))

  const e1 = await classify(admin, activeId, "error", "2021-07-01", "QA FIN: activo")
  check("activo: solo se puede marcar incobrable", !!e1.error && /solo se puede marcar como incobrable/.test(e1.error.message))
  const e2 = await classify(admin, activeId, "incobrable", "2021-04-01", "QA FIN: antes del inicio")
  check("activo: no antes del inicio del préstamo", !!e2.error && /anterior al inicio/.test(e2.error.message))
  const e3 = await classify(admin, activeId, "incobrable", addDaysIso(today0, 1), "QA FIN: futuro")
  check("activo: no con fecha futura", !!e3.error && /futura/.test(e3.error.message))

  const before = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-06-30" }))
  const lateBefore = await rpc<{ loan_id: string }[]>(admin, "finance_overdue_loans", { p_date: "2021-07-15" })
  check("activo sin clasificar: está atrasado al 15/07/2021", lateBefore.some((r) => r.loan_id === activeId))
  const w = await classify(admin, activeId, "incobrable", "2021-07-01", "QA FIN: no paga desde junio")
  check("activo: admin lo marca incobrable el 01/07/2021", !w.error, w.error?.message)
  const activeRow = must(await service.from("loans").select("status").eq("id", activeId).single(), "activo")
  check("activo: sigue activo en la base (Dashboard/Capital/Cobros no cambian)", activeRow.status === "activo")
  const stillIn = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-06-30" }))
  const out = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-07-01" }))
  check(`activo incobrable: cuenta en la cartera hasta el 30/06 y sale el 01/07 (−2,000, −1 préstamo) → ${stillIn.cap - out.cap} / ${stillIn.n - out.n}`,
    stillIn.cap === before.cap && near(stillIn.cap - out.cap, 2_000) && stillIn.n - out.n === 1)
  const lateAfter = await rpc<{ loan_id: string }[]>(admin, "finance_overdue_loans", { p_date: "2021-07-15" })
  check("activo incobrable: ya no cuenta como atrasado", !lateAfter.some((r) => r.loan_id === activeId))
  const wid = (w.data as { id: string }).id
  const sv = await supervisor.rpc("void_writeoff", { p_writeoff_id: wid, p_reason: "QA: no debe poder" })
  check("quitar clasificación: supervisor NO puede", !!sv.error && /Solo un admin/.test(sv.error.message))
  must(await admin.rpc("void_writeoff", { p_writeoff_id: wid, p_reason: "QA: prueba de quitar" }), "quitar")
  const back = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "2021-07-01" }))
  check("quitar clasificación: vuelve a la cartera", near(back.cap, stillIn.cap) && back.n === stillIn.n)
  must(await classify(admin, activeId, "incobrable", "2021-07-01", "QA FIN: no paga desde junio"), "volver a marcar")

  type Wo = { id: string; loan_id: string; kind: string; loan_status: string }
  const wo = await rpc<Wo[]>(admin, "finance_writeoffs", {})
  check("finance_writeoffs: B incobrable, A error, activo incobrable",
    wo.some((x) => x.loan_id === loanB && x.kind === "incobrable") && wo.some((x) => x.loan_id === loanA && x.kind === "error") &&
    wo.some((x) => x.loan_id === activeId && x.kind === "incobrable" && x.loan_status === "activo"))
  const wc = await cobrador.rpc("finance_writeoffs")
  check("finance_writeoffs: el cobrador no puede", !!wc.error)

  // Servicio: ganancia neta
  const mar = await getFinanceDashboard(admin as never, resolvePeriod("rango", today0, { from: "2020-03-01", to: "2020-03-31" }), today0)
  check(`marzo 2020: ganancia neta = 450 − 1,300 de gastos − 0 = −850 → ${mar.kpis.netProfit.current}`,
    mar.kpis.netProfit.current === -850 && mar.expenses.total === 1_300 && mar.expenses.count === 2)
  const apr = await getFinanceDashboard(admin as never, resolvePeriod("rango", today0, { from: "2020-04-01", to: "2020-04-30" }), today0)
  check(`abril 2020: B incobrable en el período → pérdida 4,000, ganancia neta −4,000 → ${apr.losses.periodLoss} / ${apr.kpis.netProfit.current}`,
    apr.losses.periodLoss === 4_000 && apr.kpis.netProfit.current === -4_000 && apr.losses.periodLossLoans === 1)
  check("abril 2020: comparado con marzo (−850)", apr.kpis.netProfit.previous === -850)

  // A queda "por clasificar" para probar el botón en pantalla.
  const aw = wo.find((x) => x.loan_id === loanA)!
  must(await admin.rpc("void_writeoff", { p_writeoff_id: aw.id, p_reason: "QA: dejar por clasificar para probar en pantalla" }), "A por clasificar")
}

// ===== Cuadres globales contra cálculo independiente =====
console.log("\nC. Cuadres globales (toda la base de pruebas)")
const today = todayRD()
const loans = must(await service.from("loans").select("*"), "loans")
const payments = must(await service.from("payments").select("*"), "payments")
const installments = must(await service.from("installments").select("*"), "installments")
const capTx = must(await service.from("capital_transactions").select("*"), "capital")
const dm = must(await service.from("dashboard_metrics").select("*").single(), "dashboard")
// Incobrables vigentes (fecha ≤ hoy): salen de la cartera de Finanzas, pero siguen "activos" en la base.
const writtenOff = new Set(
  must(await service.from("loan_writeoffs").select("loan_id, writeoff_date").is("voided_at", null).eq("kind", "incobrable"), "incobrables")
    .filter((w) => w.writeoff_date <= today)
    .map((w) => w.loan_id)
)
const notCancelled = new Set(loans.filter((l) => l.status !== "cancelado" && !writtenOff.has(l.id)).map((l) => l.id))
const activeAll = loans.filter((l) => l.status === "activo")
const active = activeAll.filter((l) => !writtenOff.has(l.id))
{
  const p = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "infinity" }))
  const woCap = sum(activeAll.filter((l) => writtenOff.has(l.id)), (l) => num(l.outstanding_principal))
  check(`capital en la calle (hoy) = Σ saldo de activos no incobrables = dashboard (${num(dm.lent_capital)}) − incobrables activos (${woCap}) → ${p.cap}`,
    near(p.cap, sum(active, (l) => num(l.outstanding_principal))) && near(p.cap, num(dm.lent_capital) - woCap))
  check(`ganancia por cobrar (hoy) = Σ interés pendiente de activos → ${p.int}`, near(p.int, sum(active, (l) => num(l.outstanding_interest))))
  const lent = sum(loans.filter((l) => notCancelled.has(l.id)), (l) => num(l.principal_amount))
  const recovered = sum(payments.filter((x) => notCancelled.has(x.loan_id)), (x) => num(x.principal_applied))
  check(`capital en la calle + capital recuperado = total prestado (no cancelados): ${p.cap} + ${recovered} = ${lent}`, near(p.cap + recovered, lent))
  check(`activos (hoy) = préstamos activos no incobrables (${active.length}) → ${p.n}`, p.n === active.length)
}
{
  const cash = num(await rpc(admin, "finance_cash", { p_date: "infinity" }))
  check(`caja (hoy) = dashboard_metrics.available_capital (${num(dm.available_capital)}) → ${cash}`, near(cash, num(dm.available_capital)))
  const indep = sum(capTx.filter((t) => t.transaction_date <= today), (t) => (["aporte", "pago", "ajuste"].includes(t.type) ? 1 : -1) * num(t.amount))
  check(`caja hasta hoy = cálculo independiente (${indep})`, near(num(await rpc(admin, "finance_cash", { p_date: today })), indep))
}
const year = resolvePeriod("anio", today)
{
  const f = await rpc<Flow[]>(admin, "finance_flows", { p_from: year.from, p_to: year.to })
  const inYear = payments.filter((x) => x.payment_date >= year.from && x.payment_date <= year.to)
  const interest = sum(inYear, (x) => num(x.interest_applied))
  check(`ganancia cobrada del año = Σ interés de los pagos (${interest}) → ${sum(f, (r) => num(r.interest_collected))}`, near(sum(f, (r) => num(r.interest_collected)), interest))
  check("capital + interés del año = Σ pagos del año", near(sum(f, (r) => num(r.interest_collected) + num(r.principal_collected)), sum(inYear, (x) => num(x.amount))))
  const months = await rpc<{ interest_collected: number }[]>(admin, "finance_monthly", { p_to: today, p_months: 12 })
  const from12 = addDaysIso(`${today.slice(0, 7)}-01`, 0).slice(0, 7)
  const firstMonth = (() => { const [y, m] = from12.split("-").map(Number); const i = y * 12 + m - 1 - 11; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01` })()
  const f12 = await rpc<Flow[]>(admin, "finance_flows", { p_from: firstMonth, p_to: today })
  check("Σ de los 12 meses del gráfico = resumen del mismo rango", near(sum(months, (r) => num(r.interest_collected)), sum(f12, (r) => num(r.interest_collected))))
  const users = await rpc<{ collected: number }[]>(admin, "finance_by_user", { p_from: year.from, p_to: year.to })
  check("Σ cobrado por usuario = total cobrado del año", near(sum(users, (r) => num(r.collected)), sum(inYear, (x) => num(x.amount))))
}
{
  // Atraso a hoy, calculado aquí desde las filas
  const paidByInst = new Map<string, number>()
  for (const x of payments.filter((x) => x.payment_date <= today)) paidByInst.set(x.installment_id, (paidByInst.get(x.installment_id) ?? 0) + num(x.amount))
  const loanById = new Map(loans.map((l) => [l.id, l]))
  const late = installments.filter((i) => {
    const l = loanById.get(i.loan_id)!
    return l.status !== "cancelado" && !writtenOff.has(l.id) && l.start_date <= today && i.due_date < today && num(i.total_amount) - (paidByInst.get(i.id) ?? 0) > 0.01 // tolerancia de 1 centavo
  })
  const lateLoans = new Set(late.map((i) => i.loan_id))
  const o = await rpc<{ loan_id: string; overdue_amount: number }[]>(admin, "finance_overdue_loans", { p_date: today })
  check(`préstamos con atraso hoy: ${lateLoans.size} (cálculo independiente) → ${o.length}`, o.length === lateLoans.size && o.every((r) => lateLoans.has(r.loan_id)))
  check("monto vencido = cálculo independiente", near(sum(o, (r) => num(r.overdue_amount)), sum(late, (i) => num(i.total_amount) - (paidByInst.get(i.id) ?? 0))))
}
{
  // Proyección: lo pendiente de cuotas abiertas de préstamos activos
  const activeIds = new Set(active.map((l) => l.id))
  const open = installments.filter((i) => activeIds.has(i.loan_id) && ["pendiente", "parcial", "vencida"].includes(i.status) && i.due_date <= addDaysIso(today, 27))
  const pend = (i: (typeof installments)[number], k: "principal" | "interest") =>
    num(k === "principal" ? i.principal_amount : i.interest_amount) - sum(payments.filter((x) => x.installment_id === i.id), (x) => num(k === "principal" ? x.principal_applied : x.interest_applied))
  const pr = await rpc<{ capital: number; interest: number }[]>(admin, "finance_projection", { p_date: today, p_weeks: 4 })
  check(`proyección (atrasado + 4 semanas): capital = ${sum(open, (i) => pend(i, "principal"))}`, near(sum(pr, (r) => num(r.capital)), sum(open, (i) => pend(i, "principal"))))
  check(`proyección: interés = ${sum(open, (i) => pend(i, "interest"))}`, near(sum(pr, (r) => num(r.interest)), sum(open, (i) => pend(i, "interest"))))
}
{
  // Eficiencia del año, calculada aquí
  const loanById = new Map(loans.map((l) => [l.id, l]))
  const due = installments.filter((i) => loanById.get(i.loan_id)!.status !== "cancelado" && !writtenOff.has(i.loan_id) && i.due_date >= year.from && i.due_date <= year.to)
  const paidUntil = (id: string) => sum(payments.filter((x) => x.installment_id === id && x.payment_date <= year.to), (x) => num(x.amount))
  const e = (await rpc<{ due_amount: number; collected_amount: number }[]>(admin, "finance_collection_efficiency", { p_from: year.from, p_to: year.to }))[0]
  check(`eficiencia del año: tocaba ${sum(due, (i) => num(i.total_amount))}, cobrado ${sum(due, (i) => Math.min(paidUntil(i.id), num(i.total_amount)))}`,
    near(num(e.due_amount), sum(due, (i) => num(i.total_amount))) && near(num(e.collected_amount), sum(due, (i) => Math.min(paidUntil(i.id), num(i.total_amount)))))
}

// ===== El servicio completo (lo que usa la página) =====
console.log("\nD. Servicio completo del panel (como lo usa la página)")
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await getFinanceDashboard(admin as any, resolvePeriod("mes", today), today)
  check("arma el panel sin errores", !!d && d.monthly.length === 12 && d.projection.weeks.length === 4)
  check("cartera en riesgo: grupos + al día = capital en la calle (sin fechas futuras)",
    near(d.aging.current.capitalAtRisk + d.aging.current.currentCapital, d.kpis.capitalOutstanding.current - d.futureDated.capital))
  check(`caja del panel = Capital (${num(dm.available_capital)})`, near(d.kpis.cash.current, num(dm.available_capital)))
  console.log(`     Este mes: ganancia ${d.kpis.interestCollected.current} · calle ${d.kpis.capitalOutstanding.current} · caja ${d.kpis.cash.current} · riesgo ${d.aging.current.pct?.toFixed(1)} % · eficiencia ${d.efficiency.current?.toFixed(1) ?? "—"} %`)
  const d2 = await getFinanceDashboard(admin as never, resolvePeriod("rango", today, { from: "2020-03-01", to: "2020-03-31" }), today)
  check("rango marzo 2020 en el panel: ganancia 450, eficiencia 38.5 %", d2.kpis.interestCollected.current === 450 && near(d2.efficiency.current!, 38.54, 0.01))

  // Al día (cantidad) + con atraso = préstamos en la calle hasta hoy
  const untilToday = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: today }))
  check(`al día (${d.aging.current.currentLoans}) + con atraso (${d.aging.current.loans}) = préstamos en la calle hasta hoy (${untilToday.n})`,
    d.aging.current.currentLoans + d.aging.current.loans === untilToday.n)

  // Cancelados e incobrables: cálculo independiente
  const wos = must(await service.from("loan_writeoffs").select("loan_id, kind, capital_lost, writeoff_date").is("voided_at", null), "writeoffs")
  const classified = new Set(wos.map((w) => w.loan_id))
  const principalPaid = (id: string) => sum(payments.filter((x) => x.loan_id === id), (x) => num(x.principal_applied))
  const pendingLoans = loans.filter((l) => l.status === "cancelado" && !classified.has(l.id))
  const pendingAmount = sum(pendingLoans, (l) => Math.max(num(l.principal_amount) - principalPaid(l.id), 0))
  const lossAmount = sum(wos.filter((w) => w.kind === "incobrable" && w.writeoff_date <= today), (w) => num(w.capital_lost))
  check(`por clasificar: ${pendingLoans.length} cancelados, ${pendingAmount} → ${d.losses.pendingLoans} / ${d.losses.pending}`,
    d.losses.pendingLoans === pendingLoans.length && near(d.losses.pending, pendingAmount))
  check(`pérdida reconocida (incobrables) = ${lossAmount} → ${d.losses.loss}`, near(d.losses.loss, lossAmount))
  check("marzo 2020: todavía no había cancelados ni incobrables", d2.losses.rows.length === 0 && d2.losses.loss === 0)
  const allExpenses = must(await service.from("expenses").select("amount").is("voided_at", null), "gastos")
  check(`caja después de gastos = caja − Σ gastos vigentes (${sum(allExpenses, (x) => num(x.amount))})`,
    near(d.kpis.cashAfterExpenses.current, d.kpis.cash.current - sum(allExpenses, (x) => num(x.amount))))
}

console.log(`\nResultado: ${passed} OK, ${failed} fallas`)
process.exit(failed ? 1 : 0)

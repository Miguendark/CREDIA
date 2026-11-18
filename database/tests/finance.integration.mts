/**
 * Pruebas de integración de Finanzas (migración 0013) contra nexa-pruebas.
 *
 *   npx tsx database/tests/finance.integration.mts
 *
 * - Lee SOLO .env.pruebas.local y se detiene si la URL no es nexa-pruebas.
 * - Escenario exacto: crea (una sola vez) préstamos "QA FIN 2020" fechados en
 *   2020, un año sin otros datos, y verifica cifras calculadas a mano.
 * - Cuadres globales: compara las funciones con cálculos independientes hechos
 *   aquí a partir de las filas crudas (service role).
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

// ===== Cuadres globales contra cálculo independiente =====
console.log("\nC. Cuadres globales (toda la base de pruebas)")
const today = todayRD()
const loans = must(await service.from("loans").select("*"), "loans")
const payments = must(await service.from("payments").select("*"), "payments")
const installments = must(await service.from("installments").select("*"), "installments")
const capTx = must(await service.from("capital_transactions").select("*"), "capital")
const dm = must(await service.from("dashboard_metrics").select("*").single(), "dashboard")
const notCancelled = new Set(loans.filter((l) => l.status !== "cancelado").map((l) => l.id))
const active = loans.filter((l) => l.status === "activo")
{
  const p = posTotal(await rpc<Pos[]>(admin, "finance_position", { p_date: "infinity" }))
  check(`capital en la calle (hoy) = Σ saldo de préstamos activos = dashboard (${num(dm.lent_capital)}) → ${p.cap}`,
    near(p.cap, sum(active, (l) => num(l.outstanding_principal))) && near(p.cap, num(dm.lent_capital)))
  check(`ganancia por cobrar (hoy) = Σ interés pendiente de activos → ${p.int}`, near(p.int, sum(active, (l) => num(l.outstanding_interest))))
  const lent = sum(loans.filter((l) => notCancelled.has(l.id)), (l) => num(l.principal_amount))
  const recovered = sum(payments.filter((x) => notCancelled.has(x.loan_id)), (x) => num(x.principal_applied))
  check(`capital en la calle + capital recuperado = total prestado (no cancelados): ${p.cap} + ${recovered} = ${lent}`, near(p.cap + recovered, lent))
  check(`activos (hoy) = préstamos con estado activo (${active.length}) → ${p.n}`, p.n === active.length)
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
    return l.status !== "cancelado" && l.start_date <= today && i.due_date < today && num(i.total_amount) - (paidByInst.get(i.id) ?? 0) > 0.01 // tolerancia de 1 centavo
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
  const due = installments.filter((i) => loanById.get(i.loan_id)!.status !== "cancelado" && i.due_date >= year.from && i.due_date <= year.to)
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

  // Cancelados: total = cálculo independiente desde los pagos
  const cancelled = loans.filter((l) => l.status === "cancelado")
  const principalPaid = (id: string) => sum(payments.filter((x) => x.loan_id === id), (x) => num(x.principal_applied))
  const lost = sum(cancelled, (l) => Math.max(num(l.principal_amount) - principalPaid(l.id), 0))
  check(`cancelados en el panel: ${cancelled.length} préstamos, no recuperado ${lost} → ${d.cancelled.loans} / ${d.cancelled.capitalLost}`,
    d.cancelled.loans === cancelled.length && near(d.cancelled.capitalLost, lost))
  check("marzo 2020: todavía no había cancelados", d2.cancelled.loans === 0 && d2.cancelled.capitalLost === 0)
  const d3 = await getFinanceDashboard(admin as never, resolvePeriod("rango", today, { from: "2020-04-01", to: "2020-04-30" }), today)
  check(`abril 2020: B cancelado en el período, 4,000 no recuperado → ${d3.cancelled.periodLoans} / ${d3.cancelled.periodCapitalLost}`,
    d3.cancelled.loans === 1 && d3.cancelled.periodLoans === 1 && d3.cancelled.periodCapitalLost === 4_000)
}

console.log(`\nResultado: ${passed} OK, ${failed} fallas`)
process.exit(failed ? 1 : 0)

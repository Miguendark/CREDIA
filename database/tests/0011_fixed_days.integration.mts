/**
 * Pruebas de integración de la migración 0011 contra el proyecto de PRUEBAS.
 *
 *   npx tsx database/tests/0011_fixed_days.integration.mts
 *
 * - Lee SOLO .env.pruebas.local. Se detiene si la URL no es la de
 *   nexa-pruebas (iygdktkuafnujsapudtl).
 * - Crea usuarios QA (admin/supervisor/cobrador), un cliente QA y préstamos
 *   de prueba. Nunca hace DELETE ni TRUNCATE: los datos de prueba quedan en
 *   nexa-pruebas, identificados con el prefijo "QA 0011".
 */
import { config } from "dotenv"
import { randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { calculateLoan } from "../../lib/finance/loan-calculator.ts"
import { nextFixedDay, buildFixedDaySchedule } from "../../lib/finance/fixed-days.ts"
import { planReschedule, type RescheduleInstallment } from "../../lib/finance/reschedule.ts"
import { allocatePayment } from "../../lib/finance/payment-allocator.ts"

const PRUEBAS_ID = "iygdktkuafnujsapudtl"
config({ path: ".env.pruebas.local", override: true, quiet: true })
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
if (!URL_.includes(PRUEBAS_ID)) {
  console.error(`DETENIDO: la URL no contiene ${PRUEBAS_ID}. No se ejecuta nada.`)
  process.exit(2)
}
if (!ANON || !SERVICE) {
  console.error("Faltan claves en .env.pruebas.local")
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
async function expectError(name: string, fn: () => Promise<{ error: { message: string } | null }>, re: RegExp) {
  const { error } = await fn()
  if (!error) return check(name, false, "no dio error")
  check(`${name} → "${error.message}"`, re.test(error.message), error.message)
}
function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}
const todayIso = new Date().toISOString().slice(0, 10)

// ---------- Preflight: 0011 aplicada ----------
{
  const r = await service.from("loans").select("id, schedule_type, payment_days").limit(1)
  if (r.error) {
    console.error(`DETENIDO: la migración 0011 no parece aplicada (${r.error.message})`)
    process.exit(2)
  }
}

// ---------- Usuarios QA ----------
async function qaUser(role: "admin" | "supervisor" | "cobrador"): Promise<Db> {
  const email = `qa.${role}.0011@pruebas.com`
  const password = randomBytes(18).toString("base64url") + "aA1!"
  const list = must(await service.auth.admin.listUsers({ perPage: 1000 }), "listUsers")
  let user = list.users.find((u) => u.email === email)
  if (user) {
    must(await service.auth.admin.updateUserById(user.id, { password }), "updateUser")
  } else {
    user = must(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `QA 0011 ${role}` } }), "createUser").user!
  }
  must(await service.from("users").update({ role }).eq("id", user.id).select("id").single(), `rol ${role}`)
  const client: Db = createClient(URL_, ANON, opts)
  must(await client.auth.signInWithPassword({ email, password }), `login ${role}`)
  return client
}
const admin = await qaUser("admin")
const supervisor = await qaUser("supervisor")
const cobrador = await qaUser("cobrador")
const supervisorId = (await supervisor.auth.getUser()).data.user!.id

let clientRow = must(await service.from("clients").select("id").eq("full_name", "QA 0011 Cliente").maybeSingle(), "cliente")
if (!clientRow) clientRow = must(await admin.from("clients").insert({ full_name: "QA 0011 Cliente" }).select("id").single(), "crear cliente")
const clientId = clientRow.id as string

// ---------- Helpers ----------
type Calc = ReturnType<typeof calculateLoan>
interface LoanOpts { principal: number; rate: number; type: "fixed_capital" | "declining_balance"; n: number; freq: "monthly" | "biweekly"; start: string; first: string }
function args(calc: Calc, o: LoanOpts) {
  return {
    p_client_id: clientId, p_principal_amount: o.principal, p_interest_rate: o.rate, p_interest_type: o.type,
    p_number_of_installments: o.n, p_installment_amount: calc.installmentAmount, p_total_interest: calc.totalInterest,
    p_total_amount: calc.totalAmount, p_frequency: o.freq, p_start_date: o.start, p_first_payment_date: o.first,
    p_notes: "QA 0011",
    p_installments: calc.installments.map((i) => ({
      installment_number: i.installmentNumber, due_date: i.dueDate, principal_amount: i.principalAmount,
      interest_amount: i.interestAmount, total_amount: i.totalAmount,
    })),
  }
}
const calcFor = (o: LoanOpts, days?: number[]) => calculateLoan({
  principal: o.principal, interestRate: o.rate, interestType: o.type, numberOfInstallments: o.n, frequency: o.freq,
  firstPaymentDate: o.first, schedule: days ? { type: "fixed_days", days } : undefined,
})
const loan = async (id: string) => must(await service.from("loans").select("*").eq("id", id).single(), "loan")
const insts = async (id: string) => must(await service.from("installments").select("*").eq("loan_id", id).order("installment_number"), "insts") as Record<string, unknown>[]
const planInput = (rows: Record<string, unknown>[]): RescheduleInstallment[] => rows.map((i) => ({
  id: String(i.id), installment_number: Number(i.installment_number), due_date: String(i.due_date),
  status: i.status as RescheduleInstallment["status"], amount_paid: Number(i.amount_paid),
}))
async function pay(db: Db, loanId: string, amount: number) {
  const open = (await insts(loanId)).filter((i) => ["pendiente", "parcial"].includes(String(i.status)))
  const { allocations } = allocatePayment(open.map((i) => ({
    id: String(i.id), installmentNumber: Number(i.installment_number), interestAmount: Number(i.interest_amount),
    totalAmount: Number(i.total_amount), remainingAmount: Number(i.remaining_amount),
  })), amount)
  return db.rpc("register_payment", {
    p_loan_id: loanId, p_client_id: clientId, p_payment_method: "efectivo", p_payment_date: todayIso,
    p_receipt_number: null, p_notes: "QA 0011",
    p_allocations: allocations.map((a) => ({ installment_id: a.installmentId, amount: a.amount, principal_applied: a.principalApplied, interest_applied: a.interestApplied })),
  })
}
const resched = (db: Db, loanId: string, dates: unknown, reason: string, type: string, days: number[] | null) =>
  db.rpc("reschedule_loan_installments", { p_loan_id: loanId, p_schedule_type: type, p_payment_days: days, p_new_dates: dates, p_reason: reason })
const strip = (rows: Record<string, unknown>[]) => rows.map(({ due_date: _d, status: _s, updated_at: _u, ...rest }) => rest)

// ===== A. Préstamos existentes =====
console.log("A. Préstamos existentes tras aplicar 0011")
{
  const all = must(await service.from("loans").select("schedule_type, payment_days, notes"), "loans")
  const nonQa = all.filter((l) => l.notes !== "QA 0011")
  check(`${nonQa.length} préstamos existentes (no QA) siguen como interval / NULL`,
    nonQa.every((l) => l.schedule_type === "interval" && l.payment_days === null))
}

// ===== C. RPC original =====
console.log("\nC. RPC original sigue funcionando")
const oldOpts: LoanOpts = { principal: 10000, rate: 20, type: "fixed_capital", n: 6, freq: "biweekly", start: "2026-09-01", first: "2026-09-15" }
const oldLoan = must(await cobrador.rpc("create_loan_with_installments", args(calcFor(oldOpts), oldOpts)), "rpc original") as { id: string }
{
  const l = await loan(oldLoan.id)
  check("cobrador crea préstamo con RPC original → interval / NULL", l.schedule_type === "interval" && l.payment_days === null)
}

// ===== D. Días fijos =====
console.log("\nD. create_loan_with_schedule (días 20 y 5, desordenados a propósito)")
const fxOpts: LoanOpts = { principal: 12000, rate: 20, type: "fixed_capital", n: 6, freq: "monthly", start: "2026-01-10", first: nextFixedDay("2026-01-10", [5, 20]) }
const fxCalc = calcFor(fxOpts, [5, 20])
const createFixed = (db: Db, calc: Calc, days: number[] | null, o: Partial<LoanOpts> = {}, type = "fixed_days") =>
  db.rpc("create_loan_with_schedule", { ...args(calc, { ...fxOpts, ...o }), p_schedule_type: type, p_payment_days: days })
const fxLoan = must(await createFixed(cobrador, fxCalc, [20, 5]), "crear días fijos") as { id: string }
{
  const l = await loan(fxLoan.id)
  const i = await insts(fxLoan.id)
  check("guarda fixed_days {5,20}", l.schedule_type === "fixed_days" && JSON.stringify(l.payment_days) === "[5,20]")
  check("fechas 20/01, 05/02, 20/02, 05/03, 20/03, 05/04",
    JSON.stringify(i.map((x) => x.due_date)) === JSON.stringify(["2026-01-20", "2026-02-05", "2026-02-20", "2026-03-05", "2026-03-20", "2026-04-05"]))
  const ref = calcFor({ ...fxOpts, first: "2026-02-10" })
  check("montos idénticos a la versión por frecuencia",
    JSON.stringify(i.map((x) => [x.principal_amount, x.interest_amount, x.total_amount])) ===
    JSON.stringify(ref.installments.map((x) => [x.principalAmount, x.interestAmount, x.totalAmount])) &&
    Number(l.total_amount) === ref.totalAmount && Number(l.total_interest) === ref.totalInterest)
}

// ===== E. Rechazos =====
console.log("\nE. Rechazos al crear")
{
  const c0 = (await service.from("loans").select("id", { count: "exact", head: true })).count
  await expectError("días 30 y 31", () => createFixed(admin, fxCalc, [30, 31]), /28 en adelante/)
  await expectError("días 29 y 30", () => createFixed(admin, fxCalc, [29, 30]), /28 en adelante/)
  await expectError("días repetidos", () => createFixed(admin, fxCalc, [5, 5]), /repetir/)
  await expectError("día 32", () => createFixed(admin, fxCalc, [32]), /entre 1 y 31/)
  await expectError("primera cuota incorrecta", () => createFixed(admin, fxCalc, [5, 20], { first: "2026-02-05" }), /siguiente día fijo/)
  const tampered = { ...fxCalc, installments: fxCalc.installments.map((x, k) => (k === 3 ? { ...x, dueDate: "2026-03-06" } : x)) }
  await expectError("fecha de cuota alterada", () => createFixed(admin, tampered, [5, 20]), /debería vencer/)
  await expectError("anon no puede ejecutar la RPC", () => anon.rpc("create_loan_with_schedule", { ...args(fxCalc, fxOpts), p_schedule_type: "fixed_days", p_payment_days: [5, 20] }), /permission denied|not find|JWT/i)
  await expectError("helper interno no expuesto", () => cobrador.rpc("fixed_day_after", { p_after: "2026-01-01", p_days: [5] }), /permission denied/i)
  await expectError("UPDATE directo payment_days={30,31} (admin) lo frena el check",
    async () => admin.from("loans").update({ payment_days: [30, 31] }).eq("id", fxLoan.id).select("id"), /loans_payment_days_check/)
  const c1 = (await service.from("loans").select("id", { count: "exact", head: true })).count
  check("ningún préstamo creado tras los rechazos (atomicidad)", c0 === c1)
}

// ===== F. Cambiar fecha de pago =====
console.log("\nF. Cambiar fecha de pago (1 pagada, 2 parcial, 3 vencida, 4-6 pendientes)")
{
  const i0 = await insts(fxLoan.id)
  must(await pay(admin, fxLoan.id, Number(i0[0].total_amount) + 500), "pago")
  must(await service.from("installments").update({ status: "vencida" }).eq("loan_id", fxLoan.id).eq("installment_number", 3).select("id"), "marcar vencida")
}
const before = await insts(fxLoan.id)
const loanBefore = await loan(fxLoan.id)
check("preparación: pagada / parcial / vencida", before[0].status === "pagada" && before[1].status === "parcial" && before[2].status === "vencida")
const plan = planReschedule(planInput(before), { type: "fixed_days", days: [10, 25], afterDate: todayIso })
const dates = plan.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate }))
const REASON = "QA 0011: cliente cobra los días 10 y 25"

await expectError("cobrador no puede", () => resched(cobrador, fxLoan.id, dates, REASON, "fixed_days", [10, 25]), /admin o supervisor/)
await expectError("motivo vacío", () => resched(supervisor, fxLoan.id, dates, "  ", "fixed_days", [10, 25]), /motivo/)
await expectError("incluye cuota pagada", () => resched(supervisor, fxLoan.id, [...dates, { installment_id: before[0].id, due_date: "2027-06-10" }], REASON, "fixed_days", [10, 25]), /exactamente/)
await expectError("falta una cuota", () => resched(supervisor, fxLoan.id, dates.slice(1), REASON, "fixed_days", [10, 25]), /exactamente/)
await expectError("fechas fuera del calendario", () => resched(supervisor, fxLoan.id, dates.map((d, k) => (k === 2 ? { ...d, due_date: "2027-12-31" } : d)), REASON, "fixed_days", [10, 25]), /debería vencer/)
{
  const early = buildFixedDaySchedule("2026-01-01", [10, 25], dates.length)
  await expectError("antes de la última cuota con abono", () => resched(supervisor, fxLoan.id, dates.map((d, k) => ({ ...d, due_date: early[k] })), REASON, "fixed_days", [10, 25]), /posterior a/)
}
await expectError("formato de fecha ambiguo", () => resched(supervisor, fxLoan.id, dates.map((d, k) => (k === 0 ? { ...d, due_date: "10/12/2026" } : d)), REASON, "fixed_days", [10, 25]), /AAAA-MM-DD/)
check("tras los rechazos las cuotas siguen idénticas", JSON.stringify(await insts(fxLoan.id)) === JSON.stringify(before))

{
  const r = await resched(supervisor, fxLoan.id, dates, REASON, "fixed_days", [10, 25])
  check("supervisor con motivo: OK", !r.error, r.error?.message)
}
const after = await insts(fxLoan.id)
const loanAfter = await loan(fxLoan.id)
check("montos, abonos y saldos idénticos", JSON.stringify(strip(after)) === JSON.stringify(strip(before)))
check("pagada y parcial conservan fecha y estado",
  after[0].due_date === before[0].due_date && after[1].due_date === before[1].due_date && after[0].status === "pagada" && after[1].status === "parcial")
check("cuotas 3-6 con fechas del plan", JSON.stringify(after.slice(2).map((x) => x.due_date)) === JSON.stringify(plan.changes.map((c) => c.newDate)))
check("cuota 3 vencida → pendiente", after[2].status === "pendiente")
const cols = ["principal_amount", "total_interest", "total_amount", "installment_amount", "outstanding_principal", "outstanding_interest", "total_paid", "status", "start_date", "first_payment_date", "frequency"]
check("préstamo: capital, interés, totales y saldos idénticos", cols.every((c) => loanAfter[c] === loanBefore[c]))
check("préstamo: calendario {10,25}", JSON.stringify(loanAfter.payment_days) === "[10,25]")
check("next_payment_date = cuota parcial", loanAfter.next_payment_date === before[1].due_date)
{
  const a = must(await service.from("audit_logs").select("*").eq("action", "cambiar_fecha_pago").eq("entity_id", fxLoan.id).order("created_at", { ascending: false }).limit(1).single(), "audit")
  const json = JSON.parse(String(a.description).split(" | Detalle: ")[1])
  check("audit_logs: quién = supervisor, cuándo registrado", a.user_id === supervisorId && !!a.created_at)
  check("audit_logs: motivo", json.motivo === REASON)
  check("audit_logs: antes/después por cuota", json.cuotas.length === 4 && json.cuotas[0].antes === before[2].due_date && json.cuotas[0].despues === plan.changes[0].newDate)
  console.log("    ", String(a.description).slice(0, 150) + "…")
}

// ===== F2. Interval =====
console.log("\nF2. Préstamo por frecuencia: nueva fecha de inicio (admin)")
{
  must(await pay(admin, oldLoan.id, 2500), "pago")
  const b = await insts(oldLoan.id)
  const p2 = planReschedule(planInput(b), { type: "interval", frequency: "biweekly", firstDate: "2026-12-01" })
  const r = await resched(admin, oldLoan.id, p2.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate })), "QA 0011: cambio de quincena", "interval", null)
  check("admin reprograma: OK", !r.error, r.error?.message)
  const a = await insts(oldLoan.id)
  check("fechas cada 14 días desde 01/12", JSON.stringify(a.filter((x) => Number(x.amount_paid) === 0).map((x) => x.due_date)) === JSON.stringify(p2.changes.map((c) => c.newDate)))
  check("montos idénticos", JSON.stringify(strip(a)) === JSON.stringify(strip(b)))
}

// ===== G. Mora =====
console.log("\nG. Mora con la fecha nueva")
{
  const lateOpts: LoanOpts = { principal: 3000, rate: 10, type: "fixed_capital", n: 3, freq: "monthly", start: "2026-06-01", first: "2026-07-01" }
  const late = must(await admin.rpc("create_loan_with_installments", args(calcFor(lateOpts), lateOpts)), "late") as { id: string }
  const overdue = async () => Number(must(await admin.from("dashboard_metrics").select("overdue_loans_count").single(), "metrics").overdue_loans_count)
  const o0 = await overdue()
  check("antes: next_payment_date en el pasado", String((await loan(late.id)).next_payment_date) < todayIso)
  const b = await insts(late.id)
  const p3 = planReschedule(planInput(b), { type: "fixed_days", days: [15], afterDate: todayIso })
  must(await resched(admin, late.id, p3.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate })), "QA 0011: reestructuración", "fixed_days", [15]), "resched late")
  const l = await loan(late.id)
  check("next_payment_date = nueva primera fecha", l.next_payment_date === p3.changes[0].newDate)
  check("ninguna cuota vencida", (await insts(late.id)).every((x) => String(x.due_date) >= todayIso))
  check(`dashboard_metrics: vencidos ${o0} → ${o0 - 1}`, (await overdue()) === o0 - 1)
}

// ===== H. Concurrencia =====
console.log("\nH. Concurrencia: pago y reprogramación al mismo tiempo")
{
  const cOpts: LoanOpts = { ...fxOpts, start: todayIso, first: nextFixedDay(todayIso, [5, 20]) }
  const cl = must(await createFixed(admin, calcFor(cOpts, [5, 20]), [5, 20], cOpts), "loan conc") as { id: string }
  const b = await insts(cl.id)
  const p = planReschedule(planInput(b), { type: "fixed_days", days: [8, 22], afterDate: todayIso })
  const [payR, resR] = await Promise.all([
    pay(cobrador, cl.id, 100),
    resched(supervisor, cl.id, p.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate })), "QA 0011: prueba de concurrencia", "fixed_days", [8, 22]),
  ])
  const a = await insts(cl.id)
  const partial = a.find((x) => x.status === "parcial")
  console.log(`     pago: ${payR.error ? "error " + payR.error.message : "OK"} | reprogramación: ${resR.error ? "rechazada: " + resR.error.message : "OK"}`)
  check("el pago siempre se registró", !payR.error)
  check("estado consistente: la cuota con abono nunca fue movida si la reprogramación fue después",
    resR.error ? a.every((x, k) => x.due_date === b[k].due_date) : partial?.due_date === p.changes[0].newDate)
  check("montos totales intactos", JSON.stringify(a.map((x) => x.total_amount)) === JSON.stringify(b.map((x) => x.total_amount)))
}

// ===== H2. Concurrencia, orden contrario: el pago llega primero =====
console.log("\nH2. Orden contrario: el pago llega antes que la reprogramación")
{
  const cOpts: LoanOpts = { ...fxOpts, start: todayIso, first: nextFixedDay(todayIso, [5, 20]) }
  const fresh = async () => must(await createFixed(admin, calcFor(cOpts, [5, 20]), [5, 20], cOpts), "loan H2") as { id: string }
  const toDates = (p: ReturnType<typeof planReschedule>) => p.changes.map((c) => ({ installment_id: c.installmentId, due_date: c.newDate }))
  const R = "QA 0011: concurrencia, pago primero"

  // H2a. Secuencial: el supervisor calculó el plan ANTES de que entrara el pago
  // (pantalla desactualizada). La RPC debe rechazarlo sin mover nada.
  const l1 = await fresh()
  const b = await insts(l1.id)
  const stale = planReschedule(planInput(b), { type: "fixed_days", days: [8, 22], afterDate: todayIso })
  must(await pay(cobrador, l1.id, 100), "pago H2a")
  const mid = await insts(l1.id)
  const r1 = await resched(supervisor, l1.id, toDates(stale), R, "fixed_days", [8, 22])
  console.log(`     H2a pago: OK | reprogramación con plan viejo: ${r1.error ? "rechazada: " + r1.error.message : "OK"}`)
  check("H2a: reprogramación con plan anterior al pago → rechazada", !!r1.error && /exactamente/.test(r1.error.message), r1.error?.message)
  check("H2a: tras el rechazo las cuotas siguen idénticas", JSON.stringify(await insts(l1.id)) === JSON.stringify(mid))
  const fresh2 = planReschedule(planInput(mid), { type: "fixed_days", days: [8, 22], afterDate: todayIso })
  const r2 = await resched(supervisor, l1.id, toDates(fresh2), R, "fixed_days", [8, 22])
  const a1 = await insts(l1.id)
  check("H2a: recalculando con datos frescos → OK", !r2.error, r2.error?.message)
  check("H2a: la cuota con abono conserva su fecha; solo se mueven las demás",
    a1[0].status === "parcial" && a1[0].due_date === b[0].due_date &&
    JSON.stringify(a1.slice(1).map((x) => x.due_date)) === JSON.stringify(fresh2.changes.map((c) => c.newDate)))
  check("H2a: montos totales intactos", JSON.stringify(a1.map((x) => x.total_amount)) === JSON.stringify(b.map((x) => x.total_amount)))

  // H2b. Simultáneo: se lanza el pago y 300 ms después la reprogramación.
  const l2 = await fresh()
  const b2 = await insts(l2.id)
  const p2 = planReschedule(planInput(b2), { type: "fixed_days", days: [8, 22], afterDate: todayIso })
  const payP = pay(cobrador, l2.id, 100)
  await new Promise((r) => setTimeout(r, 300))
  const resR = await resched(supervisor, l2.id, toDates(p2), R, "fixed_days", [8, 22])
  const payR = await payP
  const a2 = await insts(l2.id)
  const partial = a2.find((x) => x.status === "parcial")
  console.log(`     H2b pago: ${payR.error ? "error " + payR.error.message : "OK"} | reprogramación: ${resR.error ? "rechazada: " + resR.error.message : "OK"}`)
  console.log(`     H2b orden observado: ${resR.error ? "el pago tomó el lock primero" : "la reprogramación tomó el lock primero"}`)
  check("H2b: el pago siempre se registró", !payR.error)
  check("H2b: estado consistente (si el pago ganó, ninguna fecha se movió)",
    resR.error ? a2.every((x, k) => x.due_date === b2[k].due_date) && partial?.due_date === b2[0].due_date
               : partial?.due_date === p2.changes[0].newDate)
  check("H2b: montos totales intactos", JSON.stringify(a2.map((x) => x.total_amount)) === JSON.stringify(b2.map((x) => x.total_amount)))
}

console.log(`\nResultado: ${passed} OK, ${failed} fallas`)
process.exit(failed ? 1 : 0)

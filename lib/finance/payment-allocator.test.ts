import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { allocatePayment, centShortfall, type AllocatableInstallment } from "./payment-allocator"

// Préstamo de 13,000 en 6 cuotas (como PR-00017): cuotas de 2,166.67 con 10 % de interés.
const cuota = (n: number, remaining = 2166.67): AllocatableInstallment => ({
  id: `c${n}`,
  installmentNumber: n,
  interestAmount: 196.97,
  totalAmount: 2166.67,
  remainingAmount: remaining,
})

describe("aviso de 1 centavo (caso PR-00017)", () => {
  test("cobrar 2,166.66 de una cuota de 2,166.67 deja 1 centavo: avisa", () => {
    const targets = [cuota(3), cuota(4)]
    const r = allocatePayment(targets, 2166.66)
    assert.equal(r.allocations.length, 1)
    assert.equal(centShortfall(r, targets), 0.01)
  })
  test("el monto exacto no avisa", () => {
    const targets = [cuota(3), cuota(4)]
    assert.equal(centShortfall(allocatePayment(targets, 2166.67), targets), null)
  })
  test("un abono parcial normal (falta más de 1 centavo) no avisa", () => {
    const targets = [cuota(3)]
    assert.equal(centShortfall(allocatePayment(targets, 1000), targets), null)
    assert.equal(centShortfall(allocatePayment(targets, 2166.65), targets), null)
  })
  test("en cascada mira la última cuota que toca el pago", () => {
    const targets = [cuota(3), cuota(4)]
    // cubre la #3 completa y deja la #4 a 1 centavo
    const r = allocatePayment(targets, 4333.33)
    assert.deepEqual(
      r.allocations.map((a) => [a.installmentId, a.amount]),
      [
        ["c3", 2166.67],
        ["c4", 2166.66],
      ]
    )
    assert.equal(centShortfall(r, targets), 0.01)
  })
  test("cuota parcial: aplica sobre lo que le queda", () => {
    const targets = [cuota(3, 1166.67)]
    assert.equal(centShortfall(allocatePayment(targets, 1166.66), targets), 0.01)
    assert.equal(centShortfall(allocatePayment(targets, 1166.67), targets), null)
  })
  test("sin monto no avisa", () => {
    const targets = [cuota(3)]
    assert.equal(centShortfall(allocatePayment(targets, 0), targets), null)
  })
  test("con el monto sugerido (monto + faltante) ya no avisa", () => {
    const targets = [cuota(3)]
    const amount = 2166.66
    const missing = centShortfall(allocatePayment(targets, amount), targets)!
    assert.equal(centShortfall(allocatePayment(targets, Math.round((amount + missing) * 100) / 100), targets), null)
  })
})

/** Redondeo bancario a 2 decimales, evitando errores de punto flotante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

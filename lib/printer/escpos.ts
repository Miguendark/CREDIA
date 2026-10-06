import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { Receipt } from "@/services/receipts.service"

/**
 * Generador de tickets ESC/POS para la impresora térmica 2Connect 2C-P58-C
 * (papel de 58 mm, fuente A = 32 caracteres por línea).
 *
 * Se envía todo en ASCII puro (sin tildes ni ñ) para no depender de la
 * página de códigos que tenga configurada la impresora.
 */
export const LINE_WIDTH = 32

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

function toAscii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes (é -> e, ñ -> n)
    .replace(/[   ]/g, " ") // espacios especiales de Intl
    .replace(/[¿¡]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
}

class EscPosBuilder {
  private bytes: number[] = []

  raw(...values: number[]) {
    this.bytes.push(...values)
    return this
  }

  init() {
    return this.raw(ESC, 0x40)
  }

  align(value: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, value === "left" ? 0 : value === "center" ? 1 : 2)
  }

  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }

  /** Tamaño de letra: 1 = normal, 2 = doble. */
  size(width: 1 | 2, height: 1 | 2) {
    return this.raw(GS, 0x21, ((width - 1) << 4) | (height - 1))
  }

  text(value: string) {
    for (const ch of toAscii(value)) this.bytes.push(ch.charCodeAt(0))
    return this
  }

  line(value = "") {
    return this.text(value).raw(LF)
  }

  separator(char = "-") {
    return this.line(char.repeat(LINE_WIDTH))
  }

  /** Texto a la izquierda y valor a la derecha en la misma línea. */
  pair(label: string, value: string) {
    const left = toAscii(label)
    const right = toAscii(value)
    if (left.length + right.length + 1 > LINE_WIDTH) {
      return this.line(left).align("right").line(right).align("left")
    }
    return this.line(left + " ".repeat(LINE_WIDTH - left.length - right.length) + right)
  }

  wrapped(value: string, width = LINE_WIDTH) {
    for (const row of wrap(toAscii(value), width)) this.line(row)
    return this
  }

  feed(lines: number) {
    return this.raw(ESC, 0x64, lines)
  }

  build() {
    return new Uint8Array(this.bytes)
  }
}

function wrap(text: string, width: number): string[] {
  const rows: string[] = []
  let current = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (current) rows.push(current)
      for (let i = 0; i < word.length; i += width) rows.push(word.slice(i, i + width))
      current = ""
      continue
    }
    if (!current) current = word
    else if (current.length + 1 + word.length <= width) current += " " + word
    else {
      rows.push(current)
      current = word
    }
  }
  if (current) rows.push(current)
  return rows.length ? rows : [""]
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-DO", { hour: "2-digit", minute: "2-digit", hour12: true }).format(
    new Date(value)
  )
}

function writeCopy(b: EscPosBuilder, receipt: Receipt, copyLabel: string, reprint: boolean) {
  const percent =
    receipt.total_installments > 0
      ? Math.min(100, Math.round((receipt.installments_paid_count / receipt.total_installments) * 100))
      : 0

  // Encabezado
  b.align("center").bold(true).size(2, 2).line("CREDIA").size(1, 1).bold(false)
  b.wrapped("Prestamos que impulsan tus suenos")
  b.separator()
  b.bold(true).line("COMPROBANTE DE PAGO").bold(false)
  b.line(receipt.receipt_number)
  b.bold(true).line(`*** ${copyLabel} ***`).bold(false)
  if (reprint) b.line("(REIMPRESION)")
  if (receipt.status === "anulado") {
    b.bold(true).size(2, 1).line("ANULADO").size(1, 1).bold(false)
    if (receipt.void_reason) b.wrapped(receipt.void_reason)
  }
  b.align("left").separator()

  // Datos
  b.pair("Fecha:", formatDate(receipt.created_at))
  b.pair("Hora:", formatTime(receipt.created_at))
  b.line("Cliente:")
  b.bold(true).wrapped(receipt.client_name).bold(false)
  b.pair("Codigo:", receipt.client_code)
  b.pair("Prestamo:", receipt.loan_number)
  b.separator()

  // Monto
  b.align("center").line("MONTO PAGADO")
  b.bold(true).size(2, 2).line(formatCurrency(receipt.amount_paid)).size(1, 1).bold(false)
  b.align("left").separator()

  // Detalle
  b.wrapped(receipt.installments_label)
  b.pair("Progreso:", `${receipt.installments_paid_count}/${receipt.total_installments} (${percent}%)`)
  b.pair("Saldo pendiente:", formatCurrency(receipt.outstanding_balance))
  b.pair(
    "Proxima cuota:",
    receipt.next_payment_date ? formatDate(receipt.next_payment_date) : "Saldado"
  )
  b.pair("Cobro:", receipt.collector_name)
  b.separator()
  b.align("center").line("Gracias por su pago").align("left")
}

/**
 * Ticket completo con las dos copias seguidas:
 * 1) COPIA CLIENTE  2) COPIA NEGOCIO, separadas por una línea de corte.
 */
export function buildReceiptTicket(receipt: Receipt, options: { reprint?: boolean } = {}): Uint8Array {
  const reprint = options.reprint ?? false
  const b = new EscPosBuilder().init()

  writeCopy(b, receipt, "COPIA CLIENTE", reprint)
  b.feed(3)
  b.align("center").line("- - - - - corte aqui - - - - -").align("left")
  b.feed(3)
  writeCopy(b, receipt, "COPIA NEGOCIO", reprint)
  b.feed(5)

  return b.build()
}

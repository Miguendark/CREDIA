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

/** Teléfono que aparece debajo del logo en el ticket. */
export const BUSINESS_PHONE = "(829) 789-9985"

/** Pausa entre la copia del cliente y la del negocio, para poder cortar la primera. */
export const COPY_PAUSE_MS = 2000

/**
 * Logo de CREDIA ya convertido a mapa de bits de 1 bit (negro = imprime),
 * 256 x 132 puntos (32 bytes por fila), formato ESC/POS "GS v 0".
 * Generado a partir del logo oficial; para cambiarlo hay que regenerarlo.
 */
const LOGO_WIDTH_BYTES = 32
const LOGO_HEIGHT = 132
const LOGO_BASE64 =
  "AAAAAAAAAAAAAAAAAAAAf/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH////////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wAH////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///4AAD////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//8AAAD///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///AAAAD//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//4AAAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAAAAH/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//wAAAAAP/gADgAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AcAAAAf8AA/gAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wPAAAAA/gAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAf/+DwAAAAB4AB/8AAAAAAAAAAAAAAAAAAAAAAAAAAAB//w+AAAAADAAP/wAAAAAAAAAAAAAAAAAAAAAAAAAAAP/+PwAAAAAAAD/+AAAAAAAAAAAAAAAAAAAAAAAAAAAA//x+AAAAAAAAf/4AAAAAAAAAAAAAAAAAAAAAAAAAAAH/+fwAAAAAAAD/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAf/7+AAAAAAAA//wAAAAAAAAAAAAAAAAAAAAAAAAAAAD//fwAAAAAAAH/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7+AAAAAAAA//wAAAAAAAAAAAAAAAAAAAAAAAAAAAA///4AAAAAAAH/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAH///AAAAAAAB//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//4AAAAAAAP/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAB///gAAAAAAB//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//8AAGAAAAf/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAA///wAD+AAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//+AAf+AAAf/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//4AD/8AAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///gAP/4AA//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//+AA//wAH//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//wAH//gA//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAP//AH//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//8AA//+A//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//wAD//8P//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///AAH//5//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//8AAP/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//wAAf////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//8AAB////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//wAAD////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAAH///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//8AAAP///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//4AAAf//8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//gAAA///gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//+AAAB//8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//8AAAD//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//wAAAH/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///gAAAP/gEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///AAAAf8A8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//8AAAA/gH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//4AAAB4A/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///wAAAAAH/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///gAAAAB//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH///gAAAAP//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///AAAAD///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////AAAA////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB////gAAP///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////wAP////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/4AAP///8AAAf/////A///AAAAAAAAAAAAAAAAAAAH//+AB/////gAB/////+H////wAAB//AAAB/8AAAAAB////AH/////gAH/////4f////4AAH/8AAAP/4AAAAAf////Af/////gAf/////h/////4AAf/wAAA//gAAAAH////+B//////AB/////+H/////4AB//AAAH//AAAAB/////+H/////+AH/////4f/////wAH/8AAAf/8AAAAP/////4f/////8Af/////h//////gAf/wAAD//4AAAB//////B//////4B/////+H//////AB//AAAP//gAAAP/////4H//////wH/////4f//////AH/8AAB///AAAB///j//Af//////Af/////B//////8Af/wAAH//8AAAP//gA/4B//AAP/8B//AAAAH/8AH//4B//AAA///4AAA//4AA/AH/8AAf/4H/8AAAAf/wAD//wH/8AAD///gAAH/+AAA4Af/wAB//gf/wAAAB//AAH//Af/wAAf///AAAf/wAABAB//AAD/+B//AAAAH/8AAH/+B//AAB///8AAD/+AAAAAH/8AAP/4H/8AAAAf/wAAf/4H/8AAP///4AAP/4AAAAAf/wAA//gf/wAAAB//AAA//wf/wAA////gAB//AAAAAB//AAD/+B//AAAAH/8AAB//B//AAH////AAH/8AAAAAH/8AAf/4H/////gf/wAAH/8H/8AAf/3/8AAf/gAAAAAf/wAD//gf////+B//AAAP/4P/wAD/+f/4AD/+AAAAAB//AAf/8B/////4H/8AAA//h//AAP/4//gAP/4AAAAAH//////wH/////gf/wAAD/+D/8AB//D//AA//gAAAAAf/////+Af////+B//AAAP/4P/wAH/8H/8AD/+AAAAAB//////4B/////4H/8AAA//g//AA//gf/4AP/4AAAAAH//////AH/////gf/wAAD/+D/8AD/+A//gA//gAAAAAf/////4Af////+B//AAAP/4P/wAP/wD//AD/+AAAAAB//////AB/////4H/8AAA//g//AB//AH/8AP/4AAAAAH/////4AH/////gf/wAAH/+D/8AH/8Af/4A//wAAAAAf////+AAf/wAAAB//AAAf/4P/wA//gA//gB//AAAAAB/////wAB//AAAAH/8AAB//A//AD/+AD//AH/+AAAAAH/+D//gAH/8AAAAf/wAAP/8D/8Af/wAH/8Af/8AAAQAf/wH//AAf/wAAAB//AAB//wP/wB//AIf/4A//wAADgB//AP/8AB//AAAAH/8AAP/+A//AP/4Bw//gD//wAAfAH/8A//4AH/8AAAAf/wAB//4D/8A//gHD//AH//gAH/Af/wB//wAf/wAAAB//AAf//AP/wH/8A+H/+Af//gB/+B//AD//gB/////+H//////4A//Af/wD4f/4A//////8H/8AH/+AH/////4f//////gD/8D//Afw//wB//////4f/wAf/8Af/////h//////8AP/wP/4B/D//AD//////h//AA//4B/////+H//////gA//B//gP+H/+AH/////8H/8AB//gH/////4f/////8AD/8H/8A/4f/4AP/////gf/wAH//Af/////h//////AAP/w//wH/w//wAf////4B//AAP/+B/////+H/////4AA//D/+Af/D//AAf////AH/8AAf/8H/////4f////+AAD/8f/4D/+H/+AAf///wAf/wAA//wf/////h/////gAAP/x//AP/4f/4AAf//4AB//AAD//h/////+H////gAAA//P/8B//w//wAAH/8AAAAAAAAAAAAAAAAAAAAAAAAAD/8//gAAAB//"

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

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

  /** Imprime una imagen de 1 bit (GS v 0). */
  raster(widthBytes: number, height: number, data: Uint8Array) {
    this.raw(GS, 0x76, 0x30, 0x00, widthBytes & 0xff, widthBytes >> 8, height & 0xff, height >> 8)
    for (const byte of data) this.bytes.push(byte)
    return this
  }

  /** Cantidad de saltos de línea, para estimar cuánto tarda en imprimirse. */
  lineCount() {
    let count = 0
    for (let i = 0; i < this.bytes.length; i++) {
      if (this.bytes[i] === LF) count++
      else if (this.bytes[i] === ESC && this.bytes[i + 1] === 0x64) count += this.bytes[i + 2] ?? 0
    }
    return count
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

  // Encabezado: logo + teléfono
  b.align("center")
  b.raster(LOGO_WIDTH_BYTES, LOGO_HEIGHT, decodeBase64(LOGO_BASE64)).raw(LF)
  b.wrapped("Prestamos que impulsan tus suenos")
  b.bold(true).line(`Tel: ${BUSINESS_PHONE}`).bold(false)
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
  b.pair(
    "Proxima cuota:",
    receipt.next_payment_date ? formatDate(receipt.next_payment_date) : "Saldado"
  )
  b.pair("Cobro:", receipt.collector_name)
  b.separator()
  b.align("center").line("Gracias por su pago").align("left")
}

export interface PrintCopy {
  bytes: Uint8Array
  /** Tiempo aproximado que tarda la impresora en sacar esta copia. */
  estimatedMs: number
}

const LOGO_PRINT_MS = 700
const MS_PER_LINE = 70

function buildCopy(receipt: Receipt, copyLabel: string, reprint: boolean): PrintCopy {
  const b = new EscPosBuilder().init()
  writeCopy(b, receipt, copyLabel, reprint)
  b.feed(4) // deja espacio para cortar por la sierra de la impresora
  return { bytes: b.build(), estimatedMs: LOGO_PRINT_MS + b.lineCount() * MS_PER_LINE }
}

/**
 * Las dos copias del recibo, por separado, en el orden en que se imprimen:
 * 1) COPIA CLIENTE  2) COPIA NEGOCIO. Quien imprime deja una pausa entre
 * ambas (COPY_PAUSE_MS) para poder cortar la primera.
 */
export function buildReceiptCopies(receipt: Receipt, options: { reprint?: boolean } = {}): PrintCopy[] {
  const reprint = options.reprint ?? false
  return [
    buildCopy(receipt, "COPIA CLIENTE", reprint),
    buildCopy(receipt, "COPIA NEGOCIO", reprint),
  ]
}

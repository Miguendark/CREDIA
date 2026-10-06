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
 * 240 x 162 puntos (30 bytes por fila), formato ESC/POS "GS v 0".
 * Generado a partir del logo oficial; para cambiarlo hay que regenerarlo.
 */
const LOGO_WIDTH_BYTES = 30
const LOGO_HEIGHT = 162
const LOGO_BASE64 =
  "AAAAAAAAAAAAAAAAAAAP/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/////////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///8AD///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////gAA///AAAYAAAAAAAAAAAAAAAAAAAAAAAAAB///+AAAP/+AAB8AAAAAAAAAAAAAAAAAAAAAAAAAB///8AAAD/8AAD+AAAAAAAAAAAAAAAAAAAAAAAAAD///wAAAB/4AAP+AAAAAAAAAAAAAAAAAAAAAAAAAD///gAAAAfgAA/+AAAAAAAAAAAAAAAAAAAAAAAAAH///AAAAAPAAB/8AAAAAAAAAAAAAAAAAAAAAAAAAH//+AAAAAEAAH/4AAAAAAAAAAAAAAAAAAAAAAAAAP//8AAAAAAAAf/wAAAAAAAAAAAAAAAAAAAAAAAAAP//4AAAAAAAA//gAAAAAAAAAAAAAAAAAAAAAAAAAP//wAAAAAAAD//AAAAAAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAH/+AAAAAAAAAAAAAAAAAAAAAAAAAAf//gAAAAAAAf/8AAAAAAAAAAAAAAAAAAAAAAAAAAf//gAAAAAAA//4AAAAAAAAAAAAAAAAAAAAAAAAAA///AAAAAAAB//wAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAAAAAAH//gAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAAAAAAP//AAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAAAAAAf/8AAAAAAAAAAAAAAAAAAAAAAAAAAA//8AAAAAAA//4AAAAAAAAAAAAAAAAAAAAAAAAAAB//8AAfwAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AA/4AAH//gAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AA/8AAP//AAAAAAAAAAAAAAAAAAAAAAAAAAAB//4AA/+AAf/+AAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AA//AA//8AAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AA//gB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AA//wH//wAAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AAf/4P//gAAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AAf/+f//AAAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AAP////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAA//8AAH////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAD////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAB////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAA////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAAf///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//AAAP//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//gAAH//8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//wAAD//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//wAAB//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//4AAB//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//8AAA//BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//+AAAf+DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH///AAAP8H4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///gAADwP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///wAAAA//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///8AAAB//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///+AAAH//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////gAAf//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///8AB///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////4////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/////////gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH///////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///gH////AAAf////+Af///gAAAf/AAAAP+AAAA////wH////wAAf////+Af///8AAAf/AAAAf+AAAD////wH////8AAf////+Af////gAAf/AAAAf/AAAH////wH/////AAf////+Af////4AAf/AAAA//AAAf////wH/////gAf////+Af////8AAf/AAAA//gAA/////wH/////wAf////+Af////+AAf/AAAB//gAB/////wH/////4Af////+Af/////gAf/AAAB//wAD/////wH/////8Af////+Af/////gAf/AAAD//wAD/////wH/////8Af////+Af/////wAf/AAAD//wAH//gABgH/wAH/+Af+AAAAAf/AB//4Af/AAAH//4AP/+AAAAH/wAD/+Af+AAAAAf/AAP/8Af/AAAH//4AP/8AAAAH/wAB/+Af+AAAAAf/AAH/8Af/AAAP//8Af/4AAAAH/wAA/+Af+AAAAAf/AAD/+Af/AAAP//8Af/wAAAAH/wAA/+Af+AAAAAf/AAB/+Af/AAAf//+Af/gAAAAH/wAA/+Af+AAAAAf/AAA//Af/AAAf/f+A//AAAAAH/wAA/+Af+AAAAAf/AAA/+Af/AAA/+P/A//AAAAAH/wAA/+Af+AAAAAf/AAAf/Af/AAA/+P/A//AAAAAH/wAA/+Af////4Af/AAAf/Af/AAA/8H/A/+AAAAAH/wAB/+Af////4Af/AAAP/Af/AAB/8H/g/+AAAAAH/wAD/+Af////4Af/AAAP/Af/AAB/8H/g/+AAAAAH/wAH/8Af////4Af/AAAP/Af/AAD/4D/w/+AAAAAH/////8Af////4Af/AAAP/Af/AAD/4D/w/+AAAAAH/////4Af////4Af/AAAP/Af/AAH/wB/4/+AAAAAH/////4Af////4Af/AAAP/Af/AAH/wB/4/+AAAAAH/////wAf////4Af/AAAP/Af/AAP/gB/4/+AAAAAH/////gAf////4Af/AAAf/Af/AAP/gB/8//AAAAAH/////AAf////wAf/AAAf/Af/AAP/AA/8//AAAAAH////+AAf+AAAAAf/AAAf+Af/AAf/AA/+//AAAAAH////4AAf+AAAAAf/AAA/+Af/AAf/AAf+f/gAAAAH////wAAf+AAAAAf/AAA//Af/AA/+AAf/f/wAAAAH////4AAf+AAAAAf/AAB/+Af/AA/+AAf/f/4AAAAH/wD/4AAf+AAAAAf/AAD/+Af/AB/8AAP/P/8AAAAH/wD/+AAf+AAAAAf/AAH/8Af/AB/8AAP/P/+AAAAH/wB//AAf+AAAAAf/AAv/8Af/AD/4AAH/H/////gH/wA//AAf////+Af/////4Af/AD/wAAH/D/////wH/wAf/gAf////+Af/////wAf/AD/wAAD/B/////wH/wAf/wAf////+Af/////gAf/AH/wAAD/A/////wH/wAP/wAf////+Af/////AAf/AH/gAAD/Af////wH/wAP/4Af////+Af////+AAf/AP/gAAB/AP////wH/wAH/8Af////+Af////8AAf/AP/AAAB/AH////wH/wAD/8Af////+Af////wAAf/Af/AAAA/AD////wH/wAD/+Af////+Af////AAAf/AP+AAAA/AAf///wH/wAB//Af////+Af///8AAAf/Af+AAAA/AAH///gH/wAA//Af////+Af///AAAAf/Af8AAAAfAAAH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+Pnjz4YZj4eB8RnwZjPmJh4MMwAAAAAAAAAAAAAAzJkGQw4bjMwBGRmAb3NmLBgMOwAAAAAAAAAAAAAAzImDgw4fmMwDGRmAb3MmJBweOwAAAAAAAAAAAAAA/PHhwxsfmEeCGRnwb/PmJAYSPwAAAAAAAAAAAAAA+PEAYx80iMGBOZmAbLPGbAM/NgAAAAAAAAAAAAAAwJnjYz+wj8+B8PngZDMHx58/MwAAAAAAAAAAAAAAAADhwCAAA4YAwHDgAAADg44AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgEOAAAj4gBgMAAAAAAAAAAAAAAAAAAAAAAAAAAAHzEfAAIz4xD4+AAAAAAAAAAAAAAAAAAAAAAAAAAABjEQAAYzA5mIgAAAAAAAAAAAAAAAAAAAAAAAAAAABjEcAAYzw9sM4AAAAAAAAAAAAAAAAAAAAAAAAH/4BDEPAAYz43sMOAAAAAAAAAAAAAAAAAAAAAAAAAAABCEDAAYjAnsICAAAAAAAAAAAAAAAAAAAAAAAAAAABDMDAANjAjG42AAAAAAAAAAAAAAAAAAAAAAAAAAABB4OAAHD4hDwcAAAAAAAAAAAAA"

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

"use client"

/**
 * Conexión con la impresora térmica 2C-P58-C usando Web Serial (Chrome / Edge
 * de escritorio). En Windows la impresora emparejada por Bluetooth aparece
 * como un puerto COM ("Serie estándar sobre vínculo Bluetooth"); también
 * sirve si se conecta por USB como puerto serie.
 *
 * La primera vez el usuario elige el puerto (requestPort, requiere un clic).
 * Chrome recuerda ese permiso para este sitio, así que los siguientes
 * recibos se imprimen sin preguntar (getPorts).
 */

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  forget?: () => Promise<void>
  readonly writable: WritableStream<Uint8Array> | null
}

interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(options?: { filters?: unknown[] }): Promise<SerialPortLike>
}

export type PrinterPort = SerialPortLike

const BAUD_RATE = 9600
const CHUNK_SIZE = 256
const AUTO_PRINT_KEY = "credia.printer.autoPrint"

function getSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null
  return (navigator as Navigator & { serial?: SerialLike }).serial ?? null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isPrinterSupported(): boolean {
  return getSerial() !== null
}

/** Puerto ya autorizado en este navegador (o null si nunca se conectó). */
export async function getSavedPrinter(): Promise<PrinterPort | null> {
  const serial = getSerial()
  if (!serial) return null
  const ports = await serial.getPorts()
  return ports[0] ?? null
}

/** Abre el selector de Chrome para elegir la impresora. Debe llamarse desde un clic. */
export async function requestPrinter(): Promise<PrinterPort> {
  const serial = getSerial()
  if (!serial) throw new Error("Este navegador no permite imprimir directo. Usa Google Chrome o Microsoft Edge en la PC.")

  // Olvida la impresora anterior para que solo quede una autorizada.
  for (const port of await serial.getPorts()) {
    await port.forget?.().catch(() => {})
  }
  return serial.requestPort()
}

export function getAutoPrintEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) !== "false"
  } catch {
    return true
  }
}

export function setAutoPrintEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_PRINT_KEY, enabled ? "true" : "false")
  } catch {
    // sin almacenamiento: se queda el valor por defecto
  }
}

/** true si el error es solo que el usuario cerró el selector sin elegir. */
export function isPrinterSelectionCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFoundError"
}

export function describePrinterError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NetworkError" || error.name === "InvalidStateError") {
      return "No se pudo conectar con la impresora. Revisa que esté encendida, cerca de la PC y que PrinterTool esté cerrado."
    }
    if (error.name === "SecurityError") {
      return "El navegador bloqueó el acceso a la impresora."
    }
    return error.message
  }
  return "Error desconocido al imprimir"
}

// Cola: si se mandan dos impresiones a la vez, la segunda espera a la primera.
let queue: Promise<void> = Promise.resolve()

/**
 * Envía uno o varios bloques a la impresora usando una sola conexión.
 * `gapsMs[i]` es la espera después del bloque i (antes del siguiente).
 */
export function printRaw(
  data: Uint8Array | Uint8Array[],
  port?: PrinterPort,
  options: { gapsMs?: number[] } = {}
): Promise<void> {
  const parts = Array.isArray(data) ? data : [data]
  const job = queue.then(async () => {
    const target = port ?? (await getSavedPrinter())
    if (!target) throw new Error("No hay impresora conectada. Pulsa \"Imprimir\" para elegirla.")

    await target.open({ baudRate: BAUD_RATE })
    try {
      if (!target.writable) throw new Error("La impresora no acepta datos en este momento.")
      const writer = target.writable.getWriter()
      try {
        for (let p = 0; p < parts.length; p++) {
          const part = parts[p]
          for (let i = 0; i < part.length; i += CHUNK_SIZE) {
            await writer.write(part.slice(i, i + CHUNK_SIZE))
            await sleep(40) // deja respirar al buffer Bluetooth de la impresora
          }
          const gap = options.gapsMs?.[p]
          if (gap && p < parts.length - 1) await sleep(gap)
        }
        await writer.close()
      } finally {
        try {
          writer.releaseLock()
        } catch {
          // ya liberado por close()
        }
      }
      await sleep(300)
    } finally {
      await target.close().catch(() => {})
    }
  })
  queue = job.catch(() => {})
  return job
}

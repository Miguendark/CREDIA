import { toBlob } from "html-to-image"

/** Convierte el nodo del comprobante a un PNG de 1080x1080, sin importar el zoom con el que esté dibujado en pantalla. */
export async function receiptCardToBlob(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, {
    width: 1080,
    height: 1080,
    pixelRatio: 1,
    cacheBust: true,
  })
  if (!blob) throw new Error("No se pudo generar la imagen del comprobante")
  return blob
}

/** Intenta compartir la imagen (Web Share API, celular). "unsupported" si el navegador no lo soporta. */
export async function shareReceiptImage(
  blob: Blob,
  fileName: string
): Promise<"shared" | "unsupported"> {
  const file = new File([blob], fileName, { type: "image/png" })

  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Comprobante de pago" })
    return "shared"
  }

  return "unsupported"
}

/** Descarga directa del PNG (computadora, o respaldo cuando no hay Web Share API). */
export function downloadReceiptImage(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Construye un enlace wa.me a partir de un número local dominicano.
 * Heurística: si quedan 10 dígitos (formato 809/829/849-000-0000) se antepone
 * el código de país 1 (República Dominicana usa el plan de numeración NANP).
 * Si el usuario ya guardó el número con código de país, se usa tal cual.
 */
export function buildWhatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "")
  const withCountryCode = digits.length === 10 ? `1${digits}` : digits
  const base = `https://wa.me/${withCountryCode}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

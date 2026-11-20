/**
 * Formatos argentinos para todo el sistema: fechas dd/mm/aaaa, coma decimal, punto de miles.
 * Siempre en hora de Argentina, aunque el servidor esté en otra zona.
 */
export const ZONA = "America/Argentina/Buenos_Aires";

const fFecha = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" });
const fHora = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });

type Fecha = Date | number | null | undefined;
const aDate = (f: Fecha) => (f == null ? null : f instanceof Date ? f : new Date(f));

/** 17/11/2026 */
export function fecha(f: Fecha) {
  const d = aDate(f);
  return d ? fFecha.format(d) : "—";
}

/** 17/11/2026 14:05 */
export function fechaHora(f: Fecha) {
  const d = aDate(f);
  return d ? `${fFecha.format(d)} ${fHora.format(d)}` : "—";
}

/** 14:05 */
export function hora(f: Fecha) {
  const d = aDate(f);
  return d ? fHora.format(d) : "—";
}

/** 1.234,56 (decimales fijos) */
export function numero(n: number | null | undefined, decimales = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n);
}

/** $ 1.234,56 a partir de centavos enteros. */
export function pesos(centavos: number | null | undefined, simbolo = "$") {
  if (centavos == null) return "—";
  return `${simbolo} ${numero(centavos / 100, 2)}`;
}

/** 10,50 % a partir de centésimos de punto (1050). */
export function porcentaje(centesimos: number | null | undefined) {
  if (centesimos == null) return "—";
  return `${numero(centesimos / 100, centesimos % 100 === 0 ? 0 : 2)} %`;
}

/** Interpreta "10,5" o "10.5" (lo que escribe una persona) → 10.5. Devuelve null si no es un número. */
export function leerNumero(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let t = String(texto).trim().replace(/\s|\$|%/g, "");
  if (!t) return null;
  // "1.234,56" → miles con punto y decimales con coma
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  // "1.560" o "1.234.567" (solo puntos de miles, como se escribe en Argentina) → 1560
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de un <input type="date"> (aaaa-mm-dd) al inicio o fin de ese día en hora argentina. */
export function inicioDelDia(iso: string) {
  return new Date(`${iso}T00:00:00-03:00`);
}
export function finDelDia(iso: string) {
  return new Date(`${iso}T23:59:59.999-03:00`);
}

/** aaaa-mm-dd de hoy en Argentina (para valores por defecto de filtros). */
export function hoyIso(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
}

/** Documentos y teléfonos argentinos (sin base de datos: se prueba solo). */

export const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** CUIT/CUIL válido: 11 dígitos, prefijo conocido y dígito verificador (módulo 11). */
export function cuitValido(cuit: string) {
  const c = soloDigitos(cuit);
  if (c.length !== 11) return false;
  if (!["20", "23", "24", "25", "26", "27", "30", "33", "34"].includes(c.slice(0, 2))) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(c[10]);
}

export const formatoCuit = (c: string) => {
  const d = soloDigitos(c);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : c;
};

export function dniValido(dni: string) {
  const d = soloDigitos(dni);
  return d.length >= 7 && d.length <= 8;
}

/**
 * Celular argentino a formato de WhatsApp (549 + área + número, sin 0 ni 15).
 * Acepta «341 15 555-1234», «0341-155551234», «+54 9 341 555 1234», «3415551234».
 * Devuelve null si no parece un celular válido.
 */
export function normalizarWhatsapp(t: string | null | undefined): string | null {
  let d = soloDigitos(t);
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  // quitar el «15» después del código de área (área de 2, 3 o 4 dígitos)
  for (const largoArea of [2, 3, 4]) {
    if (d.length === 12 && d.slice(largoArea, largoArea + 2) === "15") {
      d = d.slice(0, largoArea) + d.slice(largoArea + 2);
      break;
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

/** Enlace para abrir WhatsApp con el mensaje ya escrito (la persona lo revisa y toca «Enviar»). */
export const enlaceWhatsapp = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

export const CONDICIONES_IVA = {
  consumidor_final: "Consumidor final",
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
} as const;
export type CondicionIva = keyof typeof CONDICIONES_IVA;

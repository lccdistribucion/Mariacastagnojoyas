/** Claves: hash bcrypt (costo 12) y reglas mínimas pensadas para gente no técnica. */
import bcrypt from "bcryptjs";

const COSTO = 12;

export const hashClave = (clave: string) => bcrypt.hash(clave, COSTO);
export const verificarClave = (clave: string, hash: string) => bcrypt.compare(clave, hash);

/**
 * Hash de una clave al azar: cuando el usuario no existe se compara igual contra este, así la respuesta
 * tarda lo mismo y no se puede averiguar qué usuarios existen.
 */
let hashFalso: Promise<string> | null = null;
export const hashFalso_ = () => (hashFalso ??= bcrypt.hash(crypto.randomUUID(), COSTO));

/** Devuelve el problema de la clave nueva, o null si está bien. */
export function problemaClave(clave: string, usuario?: string): string | null {
  if (clave.length < 8) return "La clave tiene que tener al menos 8 caracteres.";
  if (clave.length > 72) return "La clave es demasiado larga (máximo 72 caracteres).";
  if (!/[a-zA-ZñÑ]/.test(clave) || !/\d/.test(clave)) return "La clave tiene que tener letras y números.";
  if (usuario && clave.toLowerCase().includes(usuario.toLowerCase())) return "La clave no puede contener el nombre de usuario.";
  return null;
}

/** Clave temporal fácil de dictar (sin letras que se confundan: l/1, O/0). */
export function claveTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const nums = "23456789";
  const r = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return Array.from({ length: 5 }, () => r(letras)).join("") + Array.from({ length: 3 }, () => r(nums)).join("");
}

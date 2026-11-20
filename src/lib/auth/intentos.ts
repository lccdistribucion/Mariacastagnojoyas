/**
 * Bloqueo tras intentos fallidos. Se cuenta por usuario y por dirección IP: así no se puede
 * adivinar la clave de una persona ni probar muchos usuarios desde el mismo equipo.
 */
import { eq } from "drizzle-orm";
import { db, intentosIngreso } from "@/db";
import { leerConfig } from "../config";

export const claveUsuario = (usuario: string) => `u:${usuario.toLowerCase()}`;
export const claveIp = (ip: string) => `ip:${ip}`;

/** Minutos que faltan para poder reintentar (0 = no está bloqueado). */
export async function minutosBloqueado(clave: string, ahora = Date.now()) {
  const [fila] = await db.select().from(intentosIngreso).where(eq(intentosIngreso.clave, clave));
  const hasta = fila?.bloqueadoHasta?.getTime() ?? 0;
  return hasta > ahora ? Math.ceil((hasta - ahora) / 60000) : 0;
}

/**
 * Suma un fallo. Devuelve los minutos de bloqueo si con este fallo se bloqueó (si no, 0).
 * `factor`: el límite por equipo es más alto que por usuario (en una tablet compartida del mostrador,
 * los errores de una persona no deben bloquear enseguida a las demás).
 */
export async function registrarFallo(clave: string, ahora = Date.now(), factor = 1) {
  const cfg = await leerConfig(["seguridad.intentos_max", "seguridad.bloqueo_minutos"]);
  const max = cfg["seguridad.intentos_max"] * factor;
  const minutos = cfg["seguridad.bloqueo_minutos"];
  const [fila] = await db.select().from(intentosIngreso).where(eq(intentosIngreso.clave, clave));
  // Los fallos viejos (más tiempo que el bloqueo sin intentos) no se acumulan.
  const viejo = !fila || ahora - fila.actualizadoEn.getTime() > minutos * 60000;
  const fallos = (viejo ? 0 : fila.fallos) + 1;
  const bloquea = fallos >= max;
  const valores = {
    fallos: bloquea ? 0 : fallos,
    bloqueadoHasta: bloquea ? new Date(ahora + minutos * 60000) : null,
    actualizadoEn: new Date(ahora),
  };
  await db
    .insert(intentosIngreso)
    .values({ clave, ...valores })
    .onConflictDoUpdate({ target: intentosIngreso.clave, set: valores });
  return { bloqueo: bloquea ? minutos : 0, restantes: bloquea ? 0 : max - fallos };
}

export async function limpiarFallos(clave: string) {
  await db.delete(intentosIngreso).where(eq(intentosIngreso.clave, clave));
}

export const mensajeBloqueo = (min: number) =>
  `Por seguridad, el ingreso quedó bloqueado. Esperá ${min} ${min === 1 ? "minuto" : "minutos"} o pedile al administrador que lo desbloquee.`;

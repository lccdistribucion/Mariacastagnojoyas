/**
 * Copias de seguridad de la base. `VACUUM INTO` genera una copia completa y coherente aunque el sistema
 * esté en uso. Se guardan en `backups/`; la diaria automática además puede copiarse a otra carpeta
 * (por ejemplo, una carpeta de Google Drive o un disco externo).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { cliente } from "@/db";
import { hoyIso } from "./formato";

/** Carpeta de copias (BACKUPS_DIR permite otra; las pruebas usan una temporal para no tocar las reales). */
export const CARPETA_BACKUPS = process.env.BACKUPS_DIR ?? path.join(process.cwd(), "backups");
const PREFIJO = "maria-castagno-";

export async function crearCopia(motivo: string) {
  mkdirSync(CARPETA_BACKUPS, { recursive: true });
  const sello = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const nombre = `${PREFIJO}${sello}-${motivo.replace(/[^a-z0-9-]/gi, "")}.db`;
  const destino = path.join(CARPETA_BACKUPS, nombre);
  await cliente.execute({ sql: "VACUUM INTO ?", args: [destino] });
  return destino;
}

/** ¿Ya se hizo hoy la copia diaria? (se mira el nombre del archivo, que lleva la fecha). */
export function hayCopiaDiariaHoy() {
  if (!existsSync(CARPETA_BACKUPS)) return false;
  const hoy = hoyIso().replace(/-/g, "");
  return readdirSync(CARPETA_BACKUPS).some((f) => f.startsWith(`${PREFIJO}${hoy}`) && f.endsWith("-diaria.db"));
}

/**
 * Copia diaria: la crea, la duplica en la carpeta adicional (si hay) y conserva solo las últimas `conservar`
 * copias DIARIAS (las manuales y las de antes de migrar no se tocan nunca).
 */
export async function copiaDiaria(conservar: number, carpetaExtra: string) {
  const archivo = await crearCopia("diaria");
  let extra: string | null = null;
  if (carpetaExtra.trim()) {
    mkdirSync(carpetaExtra, { recursive: true });
    extra = path.join(carpetaExtra, path.basename(archivo));
    copyFileSync(archivo, extra);
  }
  const diarias = readdirSync(CARPETA_BACKUPS)
    .filter((f) => f.startsWith(PREFIJO) && f.endsWith("-diaria.db"))
    .sort();
  for (const viejo of diarias.slice(0, Math.max(0, diarias.length - conservar))) rmSync(path.join(CARPETA_BACKUPS, viejo));
  return { archivo, extra };
}

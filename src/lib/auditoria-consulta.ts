/** Consulta del registro de auditoría con filtros (pantalla, API y exportaciones usan la misma). */
import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { auditoria, db } from "@/db";
import { ACCIONES, ENTIDADES } from "./auditoria";
import { finDelDia, inicioDelDia } from "./formato";

export type FiltroAuditoria = {
  desde?: string; // aaaa-mm-dd
  hasta?: string;
  usuarioId?: number;
  accion?: string;
  entidad?: string;
  texto?: string;
  pagina?: number;
};

export const POR_PAGINA = 50;

function condiciones(f: FiltroAuditoria) {
  const c: SQL[] = [];
  if (f.desde) c.push(gte(auditoria.fecha, inicioDelDia(f.desde)));
  if (f.hasta) c.push(lte(auditoria.fecha, finDelDia(f.hasta)));
  if (f.usuarioId) c.push(eq(auditoria.usuarioId, f.usuarioId));
  if (f.accion && f.accion in ACCIONES) c.push(eq(auditoria.accion, f.accion));
  if (f.entidad && f.entidad in ENTIDADES) c.push(eq(auditoria.entidad, f.entidad));
  if (f.texto?.trim()) {
    const t = `%${f.texto.trim().replace(/[%_]/g, "")}%`;
    c.push(or(like(auditoria.descripcion, t), like(auditoria.usuarioNombre, t), like(auditoria.antes, t), like(auditoria.despues, t))!);
  }
  return c.length ? and(...c) : undefined;
}

export async function consultarAuditoria(f: FiltroAuditoria, todo = false) {
  const where = condiciones(f);
  const pagina = Math.max(1, f.pagina ?? 1);
  const q = db.select().from(auditoria).where(where).orderBy(desc(auditoria.fecha), desc(auditoria.id));
  const filas = todo ? await q.limit(20000) : await q.limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(auditoria).where(where);
  return { filas, total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

/** Convierte el JSON guardado en una lista legible «campo: antes → después». */
export function cambiosLegibles(antes: string | null, despues: string | null) {
  const a = antes ? (JSON.parse(antes) as Record<string, unknown>) : {};
  const d = despues ? (JSON.parse(despues) as Record<string, unknown>) : {};
  const claves = [...new Set([...Object.keys(a), ...Object.keys(d)])];
  const txt = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return claves.map((k) => ({ campo: k, antes: k in a ? txt(a[k]) : null, despues: k in d ? txt(d[k]) : null }));
}

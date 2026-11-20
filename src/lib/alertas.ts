/** Avisos para el administrador. Con `clave` se evita repetir el mismo aviso (por ejemplo, uno por día). */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alertas, db, type Tx } from "@/db";

export type NivelAlerta = "info" | "alerta" | "error";

export async function crearAlerta(
  a: { tipo: string; nivel: NivelAlerta; titulo: string; detalle?: string; clave?: string },
  tx: Tx = db,
) {
  await tx
    .insert(alertas)
    .values({ fecha: new Date(), tipo: a.tipo, nivel: a.nivel, titulo: a.titulo, detalle: a.detalle ?? null, clave: a.clave ?? null })
    .onConflictDoNothing();
}

export async function alertasSinLeer() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(alertas).where(isNull(alertas.leidaEn));
  return n;
}

export async function listarAlertas(limite = 100) {
  return db.select().from(alertas).orderBy(desc(alertas.fecha), desc(alertas.id)).limit(limite);
}

export async function marcarLeidas(usuarioId: number, id?: number) {
  await db
    .update(alertas)
    .set({ leidaEn: new Date(), leidaPor: usuarioId })
    .where(and(isNull(alertas.leidaEn), id ? eq(alertas.id, id) : undefined));
}

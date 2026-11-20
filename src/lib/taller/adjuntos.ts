/** Fotos de reparaciones (estado al ingreso) y de pedidos a medida (referencias). */
import { and, asc, eq } from "drizzle-orm";
import { adjuntos, db } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { guardarImagen } from "../stock/fotos";

export async function agregarAdjunto(entidad: "reparacion" | "pedido", entidadId: number, contenido: Buffer, actor: Actor) {
  const archivo = await guardarImagen(`${entidad}-${entidadId}`, contenido);
  await db.transaction(async (tx) => {
    await tx.insert(adjuntos).values({ entidad, entidadId, archivo, creadoEn: new Date() });
    await auditar(tx, actor, { accion: "alta", entidad, entidadId, descripcion: `Agregó una foto` });
  });
  return archivo;
}

export const listarAdjuntos = (entidad: string, entidadId: number) =>
  db.select().from(adjuntos).where(and(eq(adjuntos.entidad, entidad), eq(adjuntos.entidadId, entidadId))).orderBy(asc(adjuntos.id));

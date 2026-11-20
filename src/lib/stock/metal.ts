/** Metal propio del negocio en gramos, por ley, valuado a la cotización del día y a costo. */
import { and, eq, sql } from "drizzle-orm";
import { db, leyesMetal, movimientosMetal } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { preciosPorLey } from "../cotizaciones/vigentes";

export async function saldoMetal() {
  const filas = await db
    .select({ leyId: movimientosMetal.leyId, pesoMg: sql<number>`sum(${movimientosMetal.pesoMg})`, costo: sql<number>`sum(coalesce(${movimientosMetal.costo}, 0))` })
    .from(movimientosMetal)
    .where(eq(movimientosMetal.anulado, false))
    .groupBy(movimientosMetal.leyId);
  const precios = await preciosPorLey();
  const leyes = await db.select().from(leyesMetal);
  return filas
    .filter((f) => f.pesoMg)
    .map((f) => {
      const ley = leyes.find((l) => l.id === f.leyId)!;
      const p = precios.leyes.find((l) => l.id === f.leyId);
      const gramos = f.pesoMg / 1000;
      return {
        leyId: f.leyId,
        ley: ley?.nombre ?? "?",
        gramos,
        finoGramos: (gramos * (ley?.milesimos ?? 0)) / 1000,
        valorMercado: p?.precio ? Math.round(gramos * p.precio.mercado * 100) : null,
        valorCompra: p?.precio ? Math.round(gramos * p.precio.compra * 100) : null,
        costo: f.costo,
      };
    });
}

export async function movimientosDeMetal(limite = 100) {
  return db
    .select({ m: movimientosMetal, ley: leyesMetal.nombre })
    .from(movimientosMetal)
    .innerJoin(leyesMetal, eq(leyesMetal.id, movimientosMetal.leyId))
    .orderBy(sql`${movimientosMetal.fecha} desc`)
    .limit(limite);
}

/** Ajuste manual (fundición, merma, diferencia de pesaje). pesoMg positivo entra, negativo sale. */
export async function ajusteMetal(leyId: number, pesoMg: number, descripcion: string, actor: Actor) {
  if (!Number.isInteger(pesoMg) || pesoMg === 0) throw new ErrorValidacion("Indicá los gramos.");
  if (descripcion.trim().length < 3) throw new ErrorValidacion("Escribí el motivo.");
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(leyesMetal).where(and(eq(leyesMetal.id, leyId)));
    if (!l) throw new ErrorValidacion("Ley inexistente.");
    await tx.insert(movimientosMetal).values({ fecha: new Date(), leyId, pesoMg, tipo: "ajuste", descripcion: descripcion.trim(), usuarioId: actor.id });
    await auditar(tx, actor, { accion: "modificacion", entidad: "metal", entidadId: leyId, descripcion: `Ajuste de metal ${l.nombre}: ${pesoMg > 0 ? "+" : ""}${(pesoMg / 1000).toLocaleString("es-AR")} g (${descripcion.trim()})` });
  });
}

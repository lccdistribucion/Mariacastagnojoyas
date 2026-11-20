/**
 * Actualización masiva de precios: por porcentaje, filtrando por categoría, metal/ley, artesano o tipo.
 * Primero se ve una VISTA PREVIA (antes → después) y recién después se aplica, todo junto en una transacción,
 * con historial de precio por pieza y un registro de auditoría.
 * Las piezas con precio por gramo no se tocan: se actualizan solas con la cotización.
 */
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { db, historialPrecios, productos } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { redondear } from "./precios";
import { ESTADOS_EN_STOCK } from "./tipos";

export type FiltroMasivo = { categoriaId?: number; leyId?: number; artesano?: string; tipo?: string; moneda?: string };
export type OpcionesMasivo = { porcentaje: number; redondeo: number; incluirOferta: boolean; motivo: string };

function where(f: FiltroMasivo) {
  const c: SQL[] = [eq(productos.modoPrecio, "fijo"), inArray(productos.estado, ESTADOS_EN_STOCK)];
  if (f.categoriaId) c.push(eq(productos.categoriaId, f.categoriaId));
  if (f.leyId) c.push(eq(productos.leyId, f.leyId));
  if (f.artesano) c.push(eq(productos.artesano, f.artesano));
  if (f.tipo) c.push(eq(productos.tipo, f.tipo));
  if (f.moneda) c.push(eq(productos.monedaPrecio, f.moneda));
  return and(...c);
}

export async function vistaPrevia(f: FiltroMasivo, o: OpcionesMasivo) {
  if (!Number.isFinite(o.porcentaje) || o.porcentaje === 0 || Math.abs(o.porcentaje) > 500) throw new ErrorValidacion("Indicá un porcentaje (por ejemplo 8 o −5).");
  const filas = await db.select().from(productos).where(where(f));
  const factor = 1 + o.porcentaje / 100;
  return filas.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    moneda: p.monedaPrecio,
    listaAntes: p.precioLista,
    listaDespues: redondear(p.precioLista * factor, p.monedaPrecio === "ARS" ? o.redondeo : 0),
    ofertaAntes: p.precioOferta,
    ofertaDespues: p.precioOferta != null && o.incluirOferta ? redondear(p.precioOferta * factor, p.monedaPrecio === "ARS" ? o.redondeo : 0) : p.precioOferta,
  }));
}

export async function aplicarMasivo(f: FiltroMasivo, o: OpcionesMasivo, idsConfirmados: number[], actor: Actor) {
  if (o.motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo (por ejemplo «suba del oro 5 %»).");
  const previa = (await vistaPrevia(f, o)).filter((x) => idsConfirmados.includes(x.id));
  if (!previa.length) throw new ErrorValidacion("No hay piezas para actualizar.");
  await db.transaction(async (tx) => {
    const ahora = new Date();
    for (const x of previa) {
      await tx.update(productos).set({ precioLista: x.listaDespues, precioOferta: x.ofertaDespues, precioActualizadoEn: ahora, actualizadoEn: ahora }).where(eq(productos.id, x.id));
      await tx.insert(historialPrecios).values({ productoId: x.id, fecha: ahora, listaAntes: x.listaAntes, listaDespues: x.listaDespues, ofertaAntes: x.ofertaAntes, ofertaDespues: x.ofertaDespues, moneda: x.moneda, motivo: `Actualización masiva ${o.porcentaje > 0 ? "+" : ""}${o.porcentaje} %: ${o.motivo.trim()}`, usuarioId: actor.id });
    }
    await auditar(tx, actor, {
      accion: "modificacion",
      entidad: "producto",
      descripcion: `Actualización masiva de precios ${o.porcentaje > 0 ? "+" : ""}${o.porcentaje} % en ${previa.length} piezas (${o.motivo.trim()})`,
      antes: Object.fromEntries(previa.slice(0, 200).map((x) => [x.codigo, (x.listaAntes / 100).toLocaleString("es-AR")])),
      despues: Object.fromEntries(previa.slice(0, 200).map((x) => [x.codigo, (x.listaDespues / 100).toLocaleString("es-AR")])),
    });
  });
  return previa.length;
}

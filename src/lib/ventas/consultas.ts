/** Historial de ventas, comisiones, garantías y lo de cada cliente. */
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { canjes, clientes, cobros, db, devoluciones, mediosPago, productos, usuarios, ventaItems, ventas } from "@/db";
import { finDelDia, inicioDelDia } from "../formato";

export type FiltroVentas = { desde?: string; hasta?: string; clienteId?: number; vendedorId?: number; medioId?: number; leyId?: number; texto?: string; tipo?: "factura" | "interno"; incluirAnuladas?: boolean };

/** `soloPropias`: el vendedor ve solo sus ventas. `verSinFacturar`: si no, las internas no aparecen. */
export async function listarVentas(f: FiltroVentas, alcance: { usuarioId: number; verTodas: boolean; verSinFacturar: boolean }) {
  const c: SQL[] = [];
  if (!f.incluirAnuladas) c.push(eq(ventas.anulada, false));
  if (!alcance.verTodas) c.push(eq(ventas.vendedorId, alcance.usuarioId));
  if (!alcance.verSinFacturar) c.push(eq(ventas.tipoComprobante, "factura"));
  else if (f.tipo) c.push(eq(ventas.tipoComprobante, f.tipo));
  if (f.desde) c.push(gte(ventas.fecha, inicioDelDia(f.desde)));
  if (f.hasta) c.push(lte(ventas.fecha, finDelDia(f.hasta)));
  if (f.clienteId) c.push(eq(ventas.clienteId, f.clienteId));
  if (f.vendedorId) c.push(eq(ventas.vendedorId, f.vendedorId));
  if (f.medioId) c.push(sql`exists (select 1 from cobros x where x.venta_id = "ventas"."id" and x.medio_id = ${f.medioId} and x.anulado = 0)`);
  if (f.leyId) c.push(sql`exists (select 1 from venta_items i join productos p on p.id = i.producto_id where i.venta_id = "ventas"."id" and p.ley_id = ${f.leyId})`);
  if (f.texto?.trim()) {
    const t = `%${f.texto.trim().replace(/[%_]/g, "")}%`;
    c.push(sql`exists (select 1 from venta_items i where i.venta_id = "ventas"."id" and i.descripcion like ${t})`);
  }
  return db
    .select({ v: ventas, cliente: clientes.nombre, vendedor: usuarios.nombre })
    .from(ventas)
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .leftJoin(usuarios, eq(usuarios.id, ventas.vendedorId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(desc(ventas.fecha))
    .limit(500);
}

export async function obtenerVenta(id: number) {
  const [v] = await db.select({ v: ventas, cliente: clientes, vendedor: usuarios.nombre }).from(ventas).leftJoin(clientes, eq(clientes.id, ventas.clienteId)).leftJoin(usuarios, eq(usuarios.id, ventas.vendedorId)).where(eq(ventas.id, id));
  if (!v) return null;
  const [items, pagos, cjs, devs] = await Promise.all([
    db.select({ i: ventaItems, p: productos }).from(ventaItems).leftJoin(productos, eq(productos.id, ventaItems.productoId)).where(eq(ventaItems.ventaId, id)),
    db.select({ c: cobros, medio: mediosPago.nombre }).from(cobros).innerJoin(mediosPago, eq(mediosPago.id, cobros.medioId)).where(eq(cobros.ventaId, id)),
    db.select().from(canjes).where(eq(canjes.ventaId, id)),
    db.select().from(devoluciones).where(eq(devoluciones.ventaId, id)),
  ]);
  return { ...v.v, cliente: v.cliente, vendedor: v.vendedor, items, pagos, canjes: cjs, devoluciones: devs };
}

/** Comisiones por vendedor en un período (sobre ventas no anuladas). */
export async function comisiones(desde: string, hasta: string, usuarioId?: number) {
  return db
    .select({ vendedorId: ventas.vendedorId, vendedor: usuarios.nombre, ventas: sql<number>`count(*)`, total: sql<number>`sum(${ventas.total})`, comision: sql<number>`sum(${ventas.comision})` })
    .from(ventas)
    .leftJoin(usuarios, eq(usuarios.id, ventas.vendedorId))
    .where(and(eq(ventas.anulada, false), gte(ventas.fecha, inicioDelDia(desde)), lte(ventas.fecha, finDelDia(hasta)), usuarioId ? eq(ventas.vendedorId, usuarioId) : undefined))
    .groupBy(ventas.vendedorId);
}

/** Garantías vigentes: piezas vendidas (no devueltas) dentro del plazo de garantía de su venta. */
export async function garantiasVigentes(clienteId?: number) {
  const filas = await db
    .select({ i: ventaItems, v: ventas, cliente: clientes.nombre })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .where(and(eq(ventaItems.tipo, "pieza"), eq(ventas.anulada, false), sql`${ventaItems.devueltos} < ${ventaItems.cantidad}`, sql`${ventas.garantiaMeses} > 0`, clienteId ? eq(ventas.clienteId, clienteId) : undefined));
  const hoy = Date.now();
  return filas
    .map((f) => {
      const hasta = new Date(f.v.fecha);
      hasta.setMonth(hasta.getMonth() + f.v.garantiaMeses);
      return { ...f, hasta };
    })
    .filter((f) => f.hasta.getTime() >= hoy);
}

export async function ventasDeCliente(clienteId: number) {
  return db.select().from(ventas).where(eq(ventas.clienteId, clienteId)).orderBy(desc(ventas.fecha)).limit(100);
}

export async function itemsDeVentas(ids: number[]) {
  return ids.length ? db.select().from(ventaItems).where(inArray(ventaItems.ventaId, ids)) : [];
}

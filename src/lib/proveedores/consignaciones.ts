/**
 * Consignaciones.
 * RECIBIDA: piezas de un proveedor/artesano en nuestro stock (origen «consignación»). No generan deuda hasta que
 *   se venden; al venderse (módulo 5) se genera la deuda por su costo. Se pueden devolver al dueño.
 * ENTREGADA: piezas propias que dejamos a un tercero (revendedor, feria). Si las vende, nos debe el precio acordado;
 *   si las devuelve, vuelven a estar disponibles.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { consignacionEntregadaItems, consignacionesEntregadas, db, movimientosCcProveedores, movimientosStock, productos, proveedores, type Tx } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";

export async function consignacionRecibida(proveedorId?: number) {
  return db
    .select({ p: productos, proveedor: proveedores.razonSocial })
    .from(productos)
    .leftJoin(proveedores, eq(proveedores.id, productos.proveedorId))
    .where(and(eq(productos.origen, "consignacion"), proveedorId ? eq(productos.proveedorId, proveedorId) : undefined))
    .orderBy(asc(proveedores.razonSocial), asc(productos.codigo));
}

/** Devuelve al dueño piezas recibidas en consignación (quedan como «Devuelta al proveedor»). */
export async function devolverAlConsignante(productoIds: number[], actor: Actor) {
  if (!productoIds.length) throw new ErrorValidacion("Elegí qué piezas se devuelven.");
  await db.transaction(async (tx) => {
    const filas = await tx.select().from(productos).where(inArray(productos.id, productoIds));
    const ahora = new Date();
    for (const p of filas) {
      if (p.origen !== "consignacion") throw new ErrorValidacion(`${p.codigo} no es una pieza en consignación.`);
      if (!["disponible", "reservado"].includes(p.estado)) throw new ErrorValidacion(`${p.codigo} está ${p.estado}: no se puede devolver.`);
      await tx.update(productos).set({ estado: "devuelto", cantidad: 0, actualizadoEn: ahora }).where(eq(productos.id, p.id));
      await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "devolucion_proveedor", cantidad: -p.cantidad, stockResultante: 0, estadoAntes: p.estado, estadoDespues: "devuelto", motivo: "Devuelta al consignante", usuarioId: actor.id });
    }
    await auditar(tx, actor, { accion: "modificacion", entidad: "consignacion", descripcion: `Devolvió al consignante ${filas.length} pieza/s: ${filas.map((x) => x.codigo).join(", ")}` });
  });
}

/**
 * Deuda con el consignante cuando se vende una pieza suya (la llama el módulo de Ventas, dentro de su transacción).
 * Se le debe el COSTO acordado de la pieza, en la moneda del costo.
 */
export async function deudaPorConsignacionVendida(tx: Tx, productoId: number, documento: string, actor: Actor) {
  const [p] = await tx.select().from(productos).where(eq(productos.id, productoId));
  if (!p || p.origen !== "consignacion" || !p.proveedorId) return;
  const costo = p.costoMetal + p.costoManoObra + p.costoPiedras + p.costoOtros;
  if (!costo) return;
  await tx.insert(movimientosCcProveedores).values({ proveedorId: p.proveedorId, fecha: new Date(), tipo: "consignacion_vendida", moneda: p.monedaCosto, importe: costo, descripcion: `Vendida en consignación: ${p.codigo} · ${p.nombre} (${documento})`, usuarioId: actor.id });
}

export async function entregarEnConsignacion(proveedorId: number, items: { productoId: number; precioAcordado: number }[], notas: string, actor: Actor) {
  if (!items.length) throw new ErrorValidacion("Elegí las piezas que se entregan.");
  return db.transaction(async (tx) => {
    const [prov] = await tx.select().from(proveedores).where(eq(proveedores.id, proveedorId));
    if (!prov) throw new ErrorValidacion("El tercero no existe.");
    const [e] = await tx.insert(consignacionesEntregadas).values({ proveedorId, fecha: new Date(), notas: notas.trim() || null, usuarioId: actor.id }).returning({ id: consignacionesEntregadas.id });
    const ahora = new Date();
    for (const it of items) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId));
      if (!p) throw new ErrorValidacion("Una de las piezas no existe.");
      if (p.tipo !== "unica") throw new ErrorValidacion(`${p.codigo}: por ahora se entregan en consignación piezas únicas.`);
      if (p.estado !== "disponible") throw new ErrorValidacion(`${p.codigo} está ${p.estado}: solo se entrega una pieza disponible.`);
      if (p.origen === "consignacion") throw new ErrorValidacion(`${p.codigo} no es nuestra (está en consignación recibida).`);
      if (!Number.isInteger(it.precioAcordado) || it.precioAcordado <= 0) throw new ErrorValidacion(`${p.codigo}: indicá el precio acordado.`);
      await tx.insert(consignacionEntregadaItems).values({ consignacionId: e.id, productoId: p.id, precioAcordado: it.precioAcordado });
      await tx.update(productos).set({ estado: "consignacion_afuera", actualizadoEn: ahora }).where(eq(productos.id, p.id));
      await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "consignacion_entregada", estadoAntes: p.estado, estadoDespues: "consignacion_afuera", motivo: `Entregada en consignación a ${prov.razonSocial}`, documento: `entrega:${e.id}`, usuarioId: actor.id, stockResultante: p.cantidad });
    }
    await auditar(tx, actor, { accion: "alta", entidad: "consignacion", entidadId: e.id, descripcion: `Entregó ${items.length} pieza/s en consignación a ${prov.razonSocial}` });
    return e.id;
  });
}

/** El tercero vendió (nos debe el precio acordado) o devolvió una pieza entregada. */
export async function resolverEntregada(itemId: number, resultado: "vendida" | "devuelta", actor: Actor) {
  await db.transaction(async (tx) => {
    const [it] = await tx.select().from(consignacionEntregadaItems).where(eq(consignacionEntregadaItems.id, itemId));
    if (!it || it.estado !== "entregada") throw new ErrorValidacion("Esa pieza ya fue resuelta.");
    const [e] = await tx.select().from(consignacionesEntregadas).where(eq(consignacionesEntregadas.id, it.consignacionId));
    const [prov] = await tx.select().from(proveedores).where(eq(proveedores.id, e.proveedorId));
    const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId));
    const ahora = new Date();
    await tx.update(consignacionEntregadaItems).set({ estado: resultado, resueltoEn: ahora }).where(eq(consignacionEntregadaItems.id, itemId));
    if (resultado === "vendida") {
      await tx.update(productos).set({ estado: "vendido", cantidad: 0, actualizadoEn: ahora }).where(eq(productos.id, p.id));
      await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "venta", cantidad: -1, stockResultante: 0, estadoAntes: "consignacion_afuera", estadoDespues: "vendido", motivo: `La vendió ${prov.razonSocial} (consignación entregada)`, documento: `entrega:${e.id}`, usuarioId: actor.id });
      // Nos debe el precio acordado: en la cuenta corriente, negativo = nos debe.
      await tx.insert(movimientosCcProveedores).values({ proveedorId: prov.id, fecha: ahora, tipo: "entregada_vendida", moneda: "ARS", importe: -it.precioAcordado, descripcion: `Vendió ${p.codigo} · ${p.nombre} (consignación entregada)`, usuarioId: actor.id });
    } else {
      await tx.update(productos).set({ estado: "disponible", actualizadoEn: ahora }).where(eq(productos.id, p.id));
      await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "devolucion", estadoAntes: "consignacion_afuera", estadoDespues: "disponible", motivo: `Devuelta por ${prov.razonSocial}`, documento: `entrega:${e.id}`, usuarioId: actor.id, stockResultante: p.cantidad });
    }
    await auditar(tx, actor, { accion: "modificacion", entidad: "consignacion", entidadId: e.id, descripcion: `${p.codigo}: ${resultado === "vendida" ? `la vendió ${prov.razonSocial} (nos debe $ ${(it.precioAcordado / 100).toLocaleString("es-AR")})` : `la devolvió ${prov.razonSocial}`}` });
  });
}

export async function consignacionesEntregadasLista(proveedorId?: number) {
  return db
    .select({ it: consignacionEntregadaItems, e: consignacionesEntregadas, codigo: productos.codigo, nombre: productos.nombre, tercero: proveedores.razonSocial })
    .from(consignacionEntregadaItems)
    .innerJoin(consignacionesEntregadas, eq(consignacionesEntregadas.id, consignacionEntregadaItems.consignacionId))
    .innerJoin(productos, eq(productos.id, consignacionEntregadaItems.productoId))
    .innerJoin(proveedores, eq(proveedores.id, consignacionesEntregadas.proveedorId))
    .where(proveedorId ? eq(consignacionesEntregadas.proveedorId, proveedorId) : undefined)
    .orderBy(asc(consignacionEntregadaItems.estado), desc(consignacionesEntregadas.fecha));
}

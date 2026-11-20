/**
 * Módulo 5 y datos de ejemplo: carga reparaciones y un pedido de ejemplo, y al quitar los datos de ejemplo borra
 * también las ventas de prueba (hechas con piezas o clientes de ejemplo) y todo lo que generaron.
 * Una venta que mezcle piezas de ejemplo con piezas reales no se borra: hay que anularla antes.
 */
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  adjuntos,
  canjes,
  clientes,
  cobros,
  db,
  devoluciones,
  historialEstados,
  historialPrecios,
  mediosPago,
  movimientosCcClientes,
  movimientosCcProveedores,
  movimientosMetal,
  movimientosStock,
  pedidos,
  presupuestos,
  productoFotos,
  productoPiedras,
  productos,
  reparaciones,
  reservaItems,
  reservas,
  valeMovimientos,
  vales,
  ventaItems,
  ventas,
  type Tx,
} from "@/db";
import { SISTEMA } from "../auditoria";
import { ErrorValidacion, guardarConfig, leerUna } from "../config";

export async function cargarDemoM5() {
  if (await leerUna("demo.cargado_m5")) return 0;
  const { crearReparacion, cambiarEstadoReparacion } = await import("../taller/reparaciones");
  const { crearPedido } = await import("../taller/pedidos");
  const cli = await db.select().from(clientes).where(eq(clientes.esDemo, true));
  const por = (n: string) => cli.find((c) => c.nombre.startsWith(n));
  const [efectivo] = await db.select().from(mediosPago).where(and(eq(mediosPago.tipo, "efectivo"), eq(mediosPago.moneda, "ARS")));
  const [transf] = await db.select().from(mediosPago).where(eq(mediosPago.tipo, "transferencia"));
  let n = 0;
  const laura = por("Laura");
  const carlos = por("Carlos");
  const marcela = por("Marcela");
  const en = (d: number) => new Date(Date.now() + d * 86400_000);
  if (laura && efectivo) {
    const r = await crearReparacion({ clienteId: laura.id, descripcion: "Cadena de oro 18k cortada (ejemplo)", trabajos: ["soldadura", "limpieza"], detalle: "Cortada cerca del cierre. EJEMPLO.", pesoIngresoMg: 4200, presupuesto: 2500000, fechaPrometida: en(2), sena: [{ medioId: efectivo.id, aplicado: 1000000 }] }, SISTEMA);
    await cambiarEstadoReparacion(r.id, "lista", { nota: "Ejemplo: ya volvió del taller" }, SISTEMA);
    n++;
  }
  if (marcela) {
    await crearReparacion({ clienteId: marcela.id, descripcion: "Alianza de oro para achicar (ejemplo)", trabajos: ["talle"], detalle: "Del 18 al 16. EJEMPLO.", pesoIngresoMg: 3900, presupuesto: 1800000, fechaPrometida: en(5), sena: [] }, SISTEMA);
    n++;
  }
  if (carlos && transf) {
    await crearPedido({ clienteId: carlos.id, descripcion: "Anillo sello con iniciales C.B. en oro 18k (ejemplo)", leyId: null, piedras: "", talle: "22", modoPrecio: "congelado", presupuesto: 85000000, gramosEstimadosMg: null, hechura: 0, entregaEstimada: en(20), notas: "Pedido de EJEMPLO.", sena: [{ medioId: transf.id, aplicado: 30000000 }] }, SISTEMA);
    n++;
  }
  await guardarConfig({ "demo.cargado_m5": true }, SISTEMA);
  return n;
}

/** Se llama desde quitarDemo, dentro de su transacción y ANTES de borrar piezas y clientes de ejemplo. */
export async function limpiarVentasDemo(tx: Tx, piezas: number[], clis: number[]) {
  const porPieza = piezas.length ? (await tx.select({ id: ventaItems.ventaId }).from(ventaItems).where(inArray(ventaItems.productoId, piezas))).map((x) => x.id) : [];
  const porCliente = clis.length ? (await tx.select({ id: ventas.id }).from(ventas).where(inArray(ventas.clienteId, clis))).map((x) => x.id) : [];
  const vids = [...new Set([...porPieza, ...porCliente])];
  if (vids.length) {
    const lista = await tx.select().from(ventas).where(inArray(ventas.id, vids));
    const items = await tx.select().from(ventaItems).where(inArray(ventaItems.ventaId, vids));
    // Una venta no anulada con piezas reales no se toca.
    for (const v of lista.filter((x) => !x.anulada)) {
      const reales = items.filter((i) => i.ventaId === v.id && i.productoId != null && !piezas.includes(i.productoId) && !i.liberado);
      if (reales.length) throw new ErrorValidacion(`La venta N.º ${v.numero} tiene piezas reales además de piezas de ejemplo: anulala antes de quitar los datos de ejemplo.`);
    }
    const docs = vids.map((id) => `venta:${id}`);
    const cjs = await tx.select().from(canjes).where(inArray(canjes.ventaId, vids));
    const piezasCanje = cjs.map((c) => c.productoId).filter((x): x is number => x != null);
    if (piezasCanje.length) {
      for (const t of [movimientosStock, historialPrecios, productoPiedras, productoFotos]) await tx.delete(t).where(inArray(t.productoId, piezasCanje));
      await tx.delete(productos).where(inArray(productos.id, piezasCanje));
    }
    for (const v of lista) {
      await tx.delete(movimientosMetal).where(and(eq(movimientosMetal.tipo, "canje"), like(movimientosMetal.descripcion, `% en la venta N.º ${v.numero} (%`)));
      await tx.delete(movimientosCcProveedores).where(like(movimientosCcProveedores.descripcion, `%(venta:${v.id})%`));
    }
    const valesVenta = (await tx.select({ id: vales.id }).from(vales).where(inArray(vales.ventaOrigenId, vids))).map((x) => x.id);
    await tx.delete(valeMovimientos).where(or(inArray(valeMovimientos.ventaId, vids), valesVenta.length ? inArray(valeMovimientos.valeId, valesVenta) : sql`0`));
    if (valesVenta.length) await tx.delete(vales).where(inArray(vales.id, valesVenta));
    await tx.delete(movimientosStock).where(inArray(movimientosStock.documento, docs));
    await tx.delete(movimientosCcClientes).where(inArray(movimientosCcClientes.documento, docs));
    await tx.delete(cobros).where(inArray(cobros.ventaId, vids));
    await tx.delete(canjes).where(inArray(canjes.ventaId, vids));
    await tx.delete(devoluciones).where(inArray(devoluciones.ventaId, vids));
    await tx.delete(ventaItems).where(inArray(ventaItems.ventaId, vids));
    await tx.update(reparaciones).set({ ventaId: null }).where(inArray(reparaciones.ventaId, vids));
    await tx.update(pedidos).set({ ventaId: null }).where(inArray(pedidos.ventaId, vids));
    await tx.update(reservas).set({ ventaId: null }).where(inArray(reservas.ventaId, vids));
    await tx.update(presupuestos).set({ ventaId: null }).where(inArray(presupuestos.ventaId, vids));
    await tx.delete(ventas).where(inArray(ventas.id, vids));
  }

  // Reservas de clientes o piezas de ejemplo.
  const resIds = [
    ...new Set([
      ...(clis.length ? (await tx.select({ id: reservas.id }).from(reservas).where(inArray(reservas.clienteId, clis))).map((x) => x.id) : []),
      ...(piezas.length ? (await tx.select({ id: reservaItems.reservaId }).from(reservaItems).where(inArray(reservaItems.productoId, piezas))).map((x) => x.id) : []),
    ]),
  ];
  if (resIds.length) {
    await tx.delete(cobros).where(inArray(cobros.referencia, resIds.map((id) => `reserva:${id}`)));
    await tx.delete(reservaItems).where(inArray(reservaItems.reservaId, resIds));
    await tx.delete(reservas).where(inArray(reservas.id, resIds));
  }

  // Presupuestos de clientes de ejemplo o que incluyan piezas de ejemplo.
  const todos = await tx.select({ id: presupuestos.id, clienteId: presupuestos.clienteId, items: presupuestos.items }).from(presupuestos);
  const presIds = todos.filter((p) => (p.clienteId && clis.includes(p.clienteId)) || (JSON.parse(p.items) as { productoId: number | null }[]).some((r) => r.productoId && piezas.includes(r.productoId))).map((p) => p.id);
  if (presIds.length) await tx.delete(presupuestos).where(inArray(presupuestos.id, presIds));

  // Reparaciones y pedidos de clientes de ejemplo.
  if (clis.length) {
    const reps = await tx.select().from(reparaciones).where(inArray(reparaciones.clienteId, clis));
    const peds = await tx.select().from(pedidos).where(inArray(pedidos.clienteId, clis));
    for (const r of reps) await tx.delete(movimientosCcProveedores).where(eq(movimientosCcProveedores.descripcion, `Trabajo de taller: reparación N.º ${r.numero}`));
    for (const p of peds) {
      await tx.delete(movimientosCcProveedores).where(eq(movimientosCcProveedores.descripcion, `Trabajo de taller: pedido N.º ${p.numero}`));
      await tx.delete(movimientosMetal).where(and(inArray(movimientosMetal.tipo, ["taller_entrega", "taller_recepcion"]), like(movimientosMetal.descripcion, `%pedido N.º ${p.numero})%`)));
      await tx.delete(movimientosMetal).where(and(eq(movimientosMetal.tipo, "taller_entrega"), eq(movimientosMetal.descripcion, `Entregado al taller para el pedido N.º ${p.numero}`)));
    }
    const refs = [...reps.map((r) => `reparacion:${r.id}`), ...peds.map((p) => `pedido:${p.id}`)];
    if (refs.length) await tx.delete(cobros).where(inArray(cobros.referencia, refs));
    for (const [entidad, idsE] of [["reparacion", reps.map((r) => r.id)], ["pedido", peds.map((p) => p.id)]] as const) {
      if (!idsE.length) continue;
      await tx.delete(historialEstados).where(and(eq(historialEstados.entidad, entidad), inArray(historialEstados.entidadId, idsE)));
      await tx.delete(adjuntos).where(and(eq(adjuntos.entidad, entidad), inArray(adjuntos.entidadId, idsE)));
    }
    if (reps.length) await tx.delete(reparaciones).where(inArray(reparaciones.id, reps.map((r) => r.id)));
    if (peds.length) await tx.delete(pedidos).where(inArray(pedidos.id, peds.map((p) => p.id)));
    // Señas y cobros de cuenta corriente de clientes de ejemplo.
    await tx.delete(cobros).where(inArray(cobros.clienteId, clis));
  }
  return vids.length;
}

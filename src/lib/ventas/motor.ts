/**
 * Ventas. Una venta se guarda TODA JUNTA (una transacción): renglones, stock (piezas vendidas / unidades),
 * canjes (metal o pieza que entrega el cliente), cobros, cuenta corriente, gift cards, comisión del vendedor,
 * deuda con el consignante (si la pieza era en consignación), la foto de las cotizaciones y la auditoría.
 *
 * Los precios se calculan SIEMPRE acá (con la cotización del momento y la lista elegida): lo que manda la pantalla
 * es solo qué se vende. Cambiar un precio a mano requiere el permiso «modificar_precios».
 * Una pieza única no se puede vender dos veces: lo controla el estado y además un índice único en la base.
 */
import { and, eq, inArray, like, sql } from "drizzle-orm";
import {
  canjes,
  clientes,
  cobros,
  db,
  devoluciones,
  historialEstados,
  listasPrecios,
  movimientosCcClientes,
  movimientosCcProveedores,
  movimientosMetal,
  movimientosStock,
  pedidos,
  presupuestos,
  productos,
  reparaciones,
  reservaItems,
  reservas,
  usuarios,
  vales,
  ventaItems,
  ventas,
  type Tx,
} from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerConfig } from "../config";
import { fotoCotizaciones, preciosPorLey } from "../cotizaciones/vigentes";
import { deudaPorConsignacionVendida } from "../proveedores/consignaciones";
import { contextoPrecios, conPrecio, type ContextoPrecios } from "../stock/consultas";
import { precioConLista } from "../stock/precios";
import { crearProducto } from "../stock/productos";
import { cotizacionesCobro, procesarPagos, type PagoIn } from "./cobros";
import { crearVale, reintegrarVale } from "./vales";
import { anularCobrosEnCaja } from "../tesoreria/acreditaciones";
import { comprobantesFiscales } from "@/db";
import { movimiento } from "../tesoreria/cajas";

export type ItemIn =
  | { tipo: "pieza"; productoId: number; cantidad: number; precioUnitario?: number | null }
  | { tipo: "servicio"; referencia: string }
  | { tipo: "gift_card"; monto: number };

export type CanjeIn = { leyId: number; pesoMg: number; precioGramo?: number | null; descripcion: string; destino: "metal" | "pieza" };

export type VentaIn = {
  clienteId: number | null;
  listaId: number | null;
  items: ItemIn[];
  canjes: CanjeIn[];
  descuentoPct: number;
  pagos: PagoIn[];
  tipoComprobante: "factura" | "interno";
  notas?: string;
  presupuestoId?: number | null;
  reservaId?: number | null;
};

export type Permisos = { modificarPrecios: boolean; sinFacturar: boolean; descuentoMaxPct: number; autorizadoPor: number | null };

const ESTADOS_VENDIBLES = ["disponible"];

/** Precio de un servicio (reparación o pedido a medida) calculado acá, nunca el que manda la pantalla. */
async function precioServicio(tx: Tx, referencia: string, ctx: ContextoPrecios) {
  const [tipo, idTxt] = referencia.split(":");
  const id = Number(idTxt);
  if (tipo === "reparacion") {
    const [r] = await tx.select().from(reparaciones).where(eq(reparaciones.id, id));
    if (!r) throw new ErrorValidacion("La reparación no existe.");
    if (["entregada", "abandonada"].includes(r.estado)) throw new ErrorValidacion(`La reparación N.º ${r.numero} ya está ${r.estado}.`);
    return { descripcion: `Reparación N.º ${r.numero}: ${r.descripcion}`, precio: r.presupuesto ?? 0, clienteId: r.clienteId };
  }
  if (tipo === "pedido") {
    const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, id));
    if (!p) throw new ErrorValidacion("El pedido no existe.");
    if (["entregado", "cancelado"].includes(p.estado)) throw new ErrorValidacion(`El pedido N.º ${p.numero} ya está ${p.estado}.`);
    let precio = p.presupuesto;
    if (p.modoPrecio === "cotizacion" && p.leyId && p.gramosEstimadosMg) {
      const gramo = ctx.gramo.get(p.leyId);
      if (gramo == null) throw new ErrorValidacion("Falta la cotización del metal del pedido.");
      const peso = p.pesoFinalMg ?? p.gramosEstimadosMg;
      precio = Math.round((peso / 1000) * gramo + p.hechura / 100) * 100;
    }
    return { descripcion: `Pedido a medida N.º ${p.numero}: ${p.descripcion}`, precio, clienteId: p.clienteId };
  }
  throw new ErrorValidacion("Servicio desconocido.");
}

export type Renglon = { tipo: ItemIn["tipo"]; productoId: number | null; piezaUnica: boolean; descripcion: string; cantidad: number; precioUnitario: number; subtotal: number; costoUnitario: number; ivaPct: number; referencia: string | null; consignacion: boolean };

/** Arma los renglones con sus precios (lo usan la venta, el presupuesto y la vista previa del mostrador). */
export async function armarRenglones(tx: Tx, v: Pick<VentaIn, "items" | "listaId" | "presupuestoId" | "reservaId" | "clienteId">, permisos: Pick<Permisos, "modificarPrecios">, ctx: ContextoPrecios) {
  const [lista] = v.listaId ? await tx.select().from(listasPrecios).where(eq(listasPrecios.id, v.listaId)) : [];
  const presu = v.presupuestoId ? (await tx.select().from(presupuestos).where(eq(presupuestos.id, v.presupuestoId)))[0] : null;
  const presuVigente = presu && presu.estado === "vigente" && presu.vence.getTime() >= Date.now() ? (JSON.parse(presu.items) as Renglon[]) : null;
  const reserva = v.reservaId ? (await tx.select().from(reservas).where(eq(reservas.id, v.reservaId)))[0] : null;
  if (reserva && reserva.estado !== "activa") throw new ErrorValidacion("La reserva ya no está activa.");
  if (reserva && v.clienteId !== reserva.clienteId) throw new ErrorValidacion("La venta de una reserva tiene que ser a la misma clienta o cliente.");
  const itemsReserva = reserva ? await tx.select().from(reservaItems).where(eq(reservaItems.reservaId, reserva.id)) : [];

  const renglones: Renglon[] = [];
  const vistos = new Set<number>();
  for (const it of v.items) {
    if (it.tipo === "gift_card") {
      if (!Number.isInteger(it.monto) || it.monto <= 0) throw new ErrorValidacion("Indicá el monto de la gift card.");
      renglones.push({ tipo: "gift_card", productoId: null, piezaUnica: false, descripcion: "Gift card", cantidad: 1, precioUnitario: it.monto, subtotal: it.monto, costoUnitario: 0, ivaPct: 0, referencia: null, consignacion: false });
      continue;
    }
    if (it.tipo === "servicio") {
      const s = await precioServicio(tx, it.referencia, ctx);
      if (v.clienteId !== s.clienteId) throw new ErrorValidacion("El servicio es de otro cliente.");
      renglones.push({ tipo: "servicio", productoId: null, piezaUnica: false, descripcion: s.descripcion, cantidad: 1, precioUnitario: s.precio, subtotal: s.precio, costoUnitario: 0, ivaPct: 2100, referencia: it.referencia, consignacion: false });
      continue;
    }
    const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId));
    if (!p) throw new ErrorValidacion("Una de las piezas no existe.");
    if (p.tipo === "unica" && vistos.has(p.id)) throw new ErrorValidacion(`${p.codigo} está dos veces en la venta.`);
    vistos.add(p.id);
    const deReserva = itemsReserva.find((r) => r.productoId === p.id);
    if (!ESTADOS_VENDIBLES.includes(p.estado) && !(deReserva && ["reservado", "senado"].includes(p.estado)))
      throw new ErrorValidacion(`${p.codigo} · ${p.nombre} no está disponible (${p.estado}).`);
    const cantidad = p.tipo === "unica" ? 1 : Math.max(1, Math.round(it.cantidad));
    const { precio, costo } = conPrecio({ p }, ctx);
    let unitario = precio.vigente;
    if (lista && unitario != null) unitario = precioConLista(unitario, lista.ajustePct);
    const dePresu = presuVigente?.find((r) => r.productoId === p.id);
    if (dePresu) unitario = dePresu.precioUnitario;
    if (deReserva && reserva!.precioCongelado) unitario = deReserva.precioPactado;
    if (it.precioUnitario != null && it.precioUnitario !== unitario) {
      if (!permisos.modificarPrecios) throw new ErrorValidacion("Cambiar el precio en el mostrador requiere permiso del administrador.");
      if (!Number.isInteger(it.precioUnitario) || it.precioUnitario <= 0) throw new ErrorValidacion("Precio no válido.");
      unitario = it.precioUnitario;
    }
    if (unitario == null || unitario <= 0) throw new ErrorValidacion(`${p.codigo} no tiene precio (revisá la ley o la cotización).`);
    renglones.push({
      tipo: "pieza",
      productoId: p.id,
      piezaUnica: p.tipo === "unica",
      descripcion: `${p.codigo} · ${p.nombre}`,
      cantidad,
      precioUnitario: unitario,
      subtotal: unitario * cantidad,
      costoUnitario: costo.enPesos ?? 0,
      ivaPct: p.ivaPct,
      referencia: null,
      consignacion: p.origen === "consignacion",
    });
  }
  return renglones;
}

/** Totales (sin base de datos). El descuento no se aplica a las gift cards. */
export function calcularTotales(renglones: Pick<Renglon, "tipo" | "subtotal">[], descuentoPct: number, canje: number) {
  const subtotal = renglones.reduce((s, r) => s + r.subtotal, 0);
  const descontable = renglones.filter((r) => r.tipo !== "gift_card").reduce((s, r) => s + r.subtotal, 0);
  const descuento = Math.round((descontable * descuentoPct) / 10000);
  return { subtotal, descuento, total: subtotal - descuento - canje };
}

/** Valor del canje: gramos × precio de COMPRA de usado de la ley (o el precio que se pacte). */
export async function valorCanje(c: CanjeIn) {
  const p = await preciosPorLey();
  const ley = p.leyes.find((l) => l.id === c.leyId);
  const precioGramo = c.precioGramo ?? (ley?.precio ? Math.round(ley.precio.compra * 100) : null);
  if (!precioGramo) throw new ErrorValidacion("Falta el precio del gramo para el canje.");
  return { precioGramo, valor: Math.round((c.pesoMg / 1000) * precioGramo) };
}

export async function registrarVenta(v: VentaIn, permisos: Permisos, actor: Actor) {
  if (!v.items.length) throw new ErrorValidacion("La venta no tiene nada.");
  if (v.tipoComprobante === "interno" && !permisos.sinFacturar) throw new ErrorValidacion("No tenés permiso para ventas sin facturar.");
  if (!Number.isInteger(v.descuentoPct) || v.descuentoPct < 0 || v.descuentoPct > 10000) throw new ErrorValidacion("Descuento no válido.");
  if (v.descuentoPct > permisos.descuentoMaxPct && !permisos.autorizadoPor)
    throw new ErrorDescuento(`El descuento supera tu máximo (${permisos.descuentoMaxPct / 100} %): hace falta la clave de un administrador.`);
  if (v.canjes.length && !v.clienteId) throw new ErrorValidacion("Para recibir un canje hay que identificar al cliente (nombre y documento).");
  const ctx = await contextoPrecios();
  const cot = await cotizacionesCobro();
  const fotoCot = JSON.stringify(await fotoCotizaciones());
  const valoresCanje: (CanjeIn & { precioGramo: number; valor: number })[] = [];
  for (const c of v.canjes) {
    if (!Number.isInteger(c.pesoMg) || c.pesoMg <= 0) throw new ErrorValidacion("Indicá el peso del canje.");
    valoresCanje.push({ ...c, ...(await valorCanje(c)) });
  }
  const cfg = await leerConfig(["ventas.garantia_meses"]);

  return db.transaction(async (tx) => {
    let cliente: typeof clientes.$inferSelect | null = null;
    if (v.clienteId) {
      [cliente] = await tx.select().from(clientes).where(eq(clientes.id, v.clienteId));
      if (!cliente) throw new ErrorValidacion("El cliente no existe.");
      if (v.canjes.length && !cliente.documento) throw new ErrorValidacion("Para recibir un canje (compra de oro usado) el cliente tiene que tener DNI o CUIT cargado.");
    }
    const renglones = await armarRenglones(tx, v, permisos, ctx);
    const canje = valoresCanje.reduce((s, c) => s + c.valor, 0);
    const { subtotal, descuento, total } = calcularTotales(renglones, v.descuentoPct, canje);
    if (total < 0) throw new ErrorValidacion("El canje supera el valor de la compra.");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${ventas.numero}), 0)` }).from(ventas);
    const [vendedor] = await tx.select().from(usuarios).where(eq(usuarios.id, actor.id ?? 0));
    const comisionPct = vendedor?.comisionPct ?? 0;
    const base = renglones.filter((r) => r.tipo !== "gift_card").reduce((s, r) => s + r.subtotal, 0) - descuento;
    const ahora = new Date();
    const [venta] = await tx
      .insert(ventas)
      .values({
        numero: max + 1,
        fecha: ahora,
        clienteId: v.clienteId,
        vendedorId: actor.id ?? 0,
        tipoComprobante: v.tipoComprobante,
        estadoFiscal: v.tipoComprobante === "interno" ? "no_corresponde" : "pendiente",
        listaId: v.listaId,
        subtotal,
        descuentoPct: v.descuentoPct,
        descuento,
        canje,
        total,
        comisionPct,
        comision: Math.round((Math.max(0, base) * comisionPct) / 10000),
        garantiaMeses: cfg["ventas.garantia_meses"],
        autorizoDescuento: v.descuentoPct > permisos.descuentoMaxPct ? permisos.autorizadoPor : null,
        cotizaciones: fotoCot,
        notas: v.notas?.trim() || null,
        presupuestoId: v.presupuestoId ?? null,
        reservaId: v.reservaId ?? null,
      })
      .returning({ id: ventas.id, numero: ventas.numero });
    const doc = `venta:${venta.id}`;

    for (const r of renglones) {
      const [item] = await tx
        .insert(ventaItems)
        .values({ ventaId: venta.id, tipo: r.tipo, productoId: r.productoId, piezaUnica: r.piezaUnica, descripcion: r.descripcion, cantidad: r.cantidad, precioUnitario: r.precioUnitario, subtotal: r.subtotal, costoUnitario: r.costoUnitario, ivaPct: r.ivaPct, referencia: r.referencia })
        .returning({ id: ventaItems.id });
      if (r.tipo === "pieza") {
        const [p] = await tx.select().from(productos).where(eq(productos.id, r.productoId!));
        const cantidad = p.tipo === "unica" ? 0 : p.cantidad - r.cantidad;
        if (p.tipo !== "unica" && cantidad < 0) {
          const permitir = (await leerConfig(["stock.permitir_negativo"], tx))["stock.permitir_negativo"];
          if (!permitir) throw new ErrorValidacion(`No alcanza el stock de ${p.codigo} (hay ${p.cantidad}).`);
        }
        const estado = p.tipo === "unica" ? "vendido" : p.estado;
        await tx.update(productos).set({ cantidad, estado, actualizadoEn: ahora }).where(eq(productos.id, p.id));
        await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "venta", cantidad: -r.cantidad, stockResultante: cantidad, estadoAntes: p.estado, estadoDespues: estado, motivo: `Venta N.º ${venta.numero}`, documento: doc, usuarioId: actor.id });
        if (r.consignacion) await deudaPorConsignacionVendida(tx, p.id, `venta N.º ${venta.numero} (${doc})`, actor);
      }
      if (r.tipo === "gift_card") {
        const vale = await crearVale(tx, { tipo: "gift_card", monto: r.subtotal, clienteId: v.clienteId, ventaId: venta.id, descripcion: `Vendida en la venta N.º ${venta.numero}` });
        await tx.update(ventaItems).set({ referencia: `vale:${vale.id}`, descripcion: `Gift card ${vale.codigo}` }).where(eq(ventaItems.id, item.id));
      }
      if (r.tipo === "servicio") {
        const [tipo, id] = r.referencia!.split(":");
        if (tipo === "reparacion") await tx.update(reparaciones).set({ estado: "entregada", entregadaEn: ahora, ventaId: venta.id }).where(eq(reparaciones.id, Number(id)));
        if (tipo === "pedido") await tx.update(pedidos).set({ estado: "entregado", ventaId: venta.id }).where(eq(pedidos.id, Number(id)));
        await tx.insert(historialEstados).values({ entidad: tipo, entidadId: Number(id), fecha: ahora, estado: tipo === "pedido" ? "entregado" : "entregada", nota: `Cobrado en la venta N.º ${venta.numero}`, usuarioId: actor.id });
      }
    }

    for (const c of valoresCanje) {
      let productoId: number | null = null;
      if (c.destino === "pieza") {
        const nueva = await crearProducto(
          { codigo: "", codigoBarras: null, nombre: c.descripcion || "Pieza recibida en canje", tipo: "unica", categoriaId: null, leyId: c.leyId, metalDetalle: null, pesoBrutoMg: c.pesoMg, pesoNetoMg: c.pesoMg, medidas: null, talle: null, descripcion: null, notasInternas: `Recibida en canje (venta N.º ${venta.numero}) de ${cliente!.nombre}`, costoMetal: c.valor, costoManoObra: 0, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS", modoPrecio: "gramo", precioLista: 0, precioOferta: null, monedaPrecio: "ARS", hechura: 0, ivaPct: 2100, tratamientoIva: "bienes_usados", origen: "canje", consignante: null, ubicacionId: null, cantidad: 1, stockMinimo: 0, piedras: [] },
          actor,
          { tx },
        );
        productoId = nueva.id;
      } else {
        await tx.insert(movimientosMetal).values({ fecha: ahora, leyId: c.leyId, pesoMg: c.pesoMg, tipo: "canje", costo: c.valor, descripcion: `Canje de ${cliente!.nombre} en la venta N.º ${venta.numero} (${doc})`, usuarioId: actor.id });
      }
      await tx.insert(canjes).values({ ventaId: venta.id, clienteId: cliente!.id, fecha: ahora, leyId: c.leyId, pesoMg: c.pesoMg, precioGramo: c.precioGramo, valor: c.valor, descripcion: c.descripcion || "Metal usado", destino: c.destino, productoId });
    }

    const { recargos, aCc } = total > 0 ? await procesarPagos(tx, { clienteId: v.clienteId, ventaId: venta.id, origen: "venta", referencia: null, documento: doc, pagos: v.pagos, total, actor, cot }) : { recargos: 0, aCc: 0 };
    await tx.update(ventas).set({ recargos, aCuentaCorriente: aCc }).where(eq(ventas.id, venta.id));

    if (v.reservaId) {
      await tx.update(reservas).set({ estado: "convertida", ventaId: venta.id }).where(eq(reservas.id, v.reservaId));
      // Piezas de la reserva que no se llevó: vuelven a estar disponibles.
      const its = await tx.select().from(reservaItems).where(eq(reservaItems.reservaId, v.reservaId));
      for (const it of its.filter((x) => !renglones.some((r) => r.productoId === x.productoId)))
        await tx.update(productos).set({ estado: it.estadoPrevio }).where(and(eq(productos.id, it.productoId), inArray(productos.estado, ["reservado", "senado"])));
    }
    if (v.presupuestoId) await tx.update(presupuestos).set({ estado: "convertido", ventaId: venta.id }).where(eq(presupuestos.id, v.presupuestoId));

    await auditar(tx, actor, {
      accion: "alta",
      entidad: "venta",
      entidadId: venta.id,
      descripcion: `Venta N.º ${venta.numero}${cliente ? ` a ${cliente.nombre}` : ""}: $ ${(total / 100).toLocaleString("es-AR")}${descuento ? ` (descuento ${v.descuentoPct / 100} %)` : ""}${canje ? `, canje $ ${(canje / 100).toLocaleString("es-AR")}` : ""}${v.tipoComprobante === "interno" ? " — sin facturar" : ""}`,
    });
    return { id: venta.id, numero: venta.numero };
  });
}

export class ErrorDescuento extends ErrorValidacion {}

/** Anula una venta y revierte todo: stock, cobros, vales, cuenta corriente, canjes, consignación y servicios. */
export async function anularVenta(id: number, motivo: string, actor: Actor, opciones: { conNotaCredito?: boolean } = {}) {
  if (motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo de la anulación.");
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(ventas).where(eq(ventas.id, id));
    if (!v || v.anulada) throw new ErrorValidacion("La venta no existe o ya está anulada.");
    if (v.estadoFiscal === "emitido" && !opciones.conNotaCredito) throw new ErrorValidacion("La venta tiene factura electrónica: se anula con nota de crédito (botón «Anular con nota de crédito»).");
    // Una factura que ya pidió número a ARCA y no se sabe si quedó autorizada: primero hay que reintentarla.
    const enCurso = await tx.select().from(comprobantesFiscales).where(and(eq(comprobantesFiscales.ventaId, id), eq(comprobantesFiscales.estado, "pendiente")));
    if (enCurso.some((c) => c.numero != null && [1, 6, 11].includes(c.tipo))) throw new ErrorValidacion("La factura de esta venta quedó a medio pedir en ARCA: reintentala (Facturación → Pendientes) antes de anular.");
    if (enCurso.length) await tx.update(comprobantesFiscales).set({ estado: "rechazado", errores: "Venta anulada antes de facturar" }).where(and(eq(comprobantesFiscales.ventaId, id), eq(comprobantesFiscales.estado, "pendiente")));
    const doc = `venta:${id}`;
    const ahora = new Date();
    const items = await tx.select().from(ventaItems).where(eq(ventaItems.ventaId, id));
    for (const it of items) {
      if (it.tipo === "pieza" && it.productoId) {
        const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId));
        const vuelven = it.cantidad - it.devueltos;
        if (vuelven > 0) {
          const cantidad = p.tipo === "unica" ? 1 : p.cantidad + vuelven;
          await tx.update(productos).set({ cantidad, estado: p.tipo === "unica" ? "disponible" : p.estado, actualizadoEn: ahora }).where(eq(productos.id, p.id));
          await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "ajuste", cantidad: vuelven, stockResultante: cantidad, estadoAntes: p.estado, estadoDespues: p.tipo === "unica" ? "disponible" : p.estado, motivo: `Anulación de la venta N.º ${v.numero} (${motivo.trim()})`, documento: doc, usuarioId: actor.id, autorizadoPor: actor.id });
        }
        await tx.update(ventaItems).set({ liberado: true }).where(eq(ventaItems.id, it.id));
      }
      if (it.tipo === "gift_card" && it.referencia) {
        const [vale] = await tx.select().from(vales).where(eq(vales.id, Number(it.referencia.split(":")[1])));
        if (vale && vale.saldo !== vale.monto) throw new ErrorValidacion(`La gift card ${vale.codigo} ya se usó: no se puede anular la venta.`);
        if (vale) await tx.update(vales).set({ anulado: true }).where(eq(vales.id, vale.id));
      }
      if (it.tipo === "servicio" && it.referencia) {
        const [tipo, rid] = it.referencia.split(":");
        if (tipo === "reparacion") await tx.update(reparaciones).set({ estado: "lista", entregadaEn: null, ventaId: null }).where(eq(reparaciones.id, Number(rid)));
        if (tipo === "pedido") await tx.update(pedidos).set({ estado: "listo", ventaId: null }).where(eq(pedidos.id, Number(rid)));
      }
    }
    const cs = await tx.select().from(cobros).where(and(eq(cobros.ventaId, id), eq(cobros.anulado, false)));
    for (const c of cs) if (c.valeId) await reintegrarVale(tx, c.valeId, c.aplicado, id);
    await tx.update(cobros).set({ anulado: true }).where(eq(cobros.ventaId, id));
    await anularCobrosEnCaja(tx, cs.map((c) => c.id), actor);
    await tx.update(movimientosCcClientes).set({ anulado: true }).where(eq(movimientosCcClientes.documento, doc));
    await tx.update(movimientosCcProveedores).set({ anulado: true }).where(and(eq(movimientosCcProveedores.tipo, "consignacion_vendida"), like(movimientosCcProveedores.descripcion, `%(${doc})%`)));
    await tx.update(movimientosMetal).set({ anulado: true }).where(like(movimientosMetal.descripcion, `%(${doc})%`));
    const cjs = await tx.select().from(canjes).where(eq(canjes.ventaId, id));
    for (const c of cjs) {
      if (c.productoId) await tx.update(productos).set({ estado: "baja", cantidad: 0 }).where(eq(productos.id, c.productoId));
      await tx.update(canjes).set({ anulado: true }).where(eq(canjes.id, c.id));
    }
    if (v.reservaId) await tx.update(reservas).set({ estado: "cancelada" }).where(eq(reservas.id, v.reservaId));
    if (v.presupuestoId) await tx.update(presupuestos).set({ estado: "vigente", ventaId: null }).where(eq(presupuestos.id, v.presupuestoId));
    await tx.update(ventas).set({ anulada: true, anuladaPor: actor.id, motivoAnulacion: motivo.trim() }).where(eq(ventas.id, id));
    await auditar(tx, actor, { accion: "anulacion", entidad: "venta", entidadId: id, descripcion: `Anuló la venta N.º ${v.numero} (${motivo.trim()}): se revirtieron stock, cobros, cuenta corriente y canjes` });
  });
}

/**
 * Devolución o cambio: las piezas vuelven al stock y el importe se devuelve como VALE (para un cambio), como
 * saldo a favor en la cuenta corriente, o en efectivo/transferencia (reintegro). La nota de crédito fiscal se
 * emite en el módulo 7.
 */
export async function registrarDevolucion(
  ventaId: number,
  d: { items: { itemId: number; cantidad: number }[]; forma: "vale" | "cuenta_corriente" | "reintegro"; motivo: string; cajaId?: number | null },
  actor: Actor,
) {
  if (d.motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo de la devolución.");
  if (!d.items.length) throw new ErrorValidacion("Elegí qué se devuelve.");
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(ventas).where(eq(ventas.id, ventaId));
    if (!v || v.anulada) throw new ErrorValidacion("La venta no existe o está anulada.");
    if (d.forma === "cuenta_corriente" && !v.clienteId) throw new ErrorValidacion("Para dejar saldo a favor la venta tiene que tener cliente.");
    if (d.forma === "reintegro" && !d.cajaId) throw new ErrorValidacion("Elegí de qué caja sale el dinero que se devuelve.");
    const ahora = new Date();
    const doc = `venta:${ventaId}`;
    let importe = 0;
    const detalle = [];
    for (const x of d.items) {
      const [it] = await tx.select().from(ventaItems).where(and(eq(ventaItems.id, x.itemId), eq(ventaItems.ventaId, ventaId)));
      if (!it || it.tipo !== "pieza") throw new ErrorValidacion("Solo se devuelven piezas.");
      const cant = Math.round(x.cantidad);
      if (cant < 1 || cant > it.cantidad - it.devueltos) throw new ErrorValidacion(`${it.descripcion}: cantidad a devolver no válida.`);
      // Se devuelve lo que pagó por la pieza, con el descuento de la venta proporcional.
      const monto = Math.round(it.precioUnitario * cant * (1 - v.descuentoPct / 10000));
      importe += monto;
      detalle.push({ itemId: it.id, cantidad: cant, importe: monto });
      const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId!));
      const cantidad = p.tipo === "unica" ? 1 : p.cantidad + cant;
      await tx.update(productos).set({ cantidad, estado: p.tipo === "unica" ? "disponible" : p.estado, actualizadoEn: ahora }).where(eq(productos.id, p.id));
      await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "devolucion", cantidad: cant, stockResultante: cantidad, estadoAntes: p.estado, estadoDespues: p.tipo === "unica" ? "disponible" : p.estado, motivo: `Devolución de la venta N.º ${v.numero}: ${d.motivo.trim()}`, documento: doc, usuarioId: actor.id });
      await tx.update(ventaItems).set({ devueltos: it.devueltos + cant, liberado: it.piezaUnica ? true : it.liberado }).where(eq(ventaItems.id, it.id));
      if (p.origen === "consignacion" && p.proveedorId) {
        const costo = p.costoMetal + p.costoManoObra + p.costoPiedras + p.costoOtros;
        if (costo) await tx.insert(movimientosCcProveedores).values({ proveedorId: p.proveedorId, fecha: ahora, tipo: "ajuste", moneda: p.monedaCosto, importe: -costo, descripcion: `Devolución de ${p.codigo} (venta N.º ${v.numero}): ya no se le debe`, usuarioId: actor.id });
      }
    }
    let valeId: number | null = null;
    let codigo: string | null = null;
    if (d.forma === "vale") {
      const vale = await crearVale(tx, { tipo: "vale", monto: importe, clienteId: v.clienteId, ventaId, descripcion: `Devolución de la venta N.º ${v.numero}` });
      valeId = vale.id;
      codigo = vale.codigo;
    } else if (d.forma === "cuenta_corriente") {
      await tx.insert(movimientosCcClientes).values({ clienteId: v.clienteId!, fecha: ahora, tipo: "nota_credito", importe: -importe, descripcion: `Devolución de la venta N.º ${v.numero}`, documento: `devolucion:${ventaId}`, usuarioId: actor.id });
    }
    const [dev] = await tx.insert(devoluciones).values({ ventaId, fecha: ahora, items: JSON.stringify(detalle), importe, forma: d.forma, valeId, motivo: d.motivo.trim(), usuarioId: actor.id }).returning({ id: devoluciones.id });
    // Reintegro: el dinero sale de la caja elegida (en pesos).
    if (d.forma === "reintegro") await movimiento(tx, { cajaId: d.cajaId!, tipo: "reintegro", importe: -importe, descripcion: `Reintegro por devolución en la venta N.º ${String(v.numero).padStart(6, "0")}`, referencia: `devolucion:${dev.id}`, moneda: "ARS" }, actor);
    await auditar(tx, actor, { accion: "alta", entidad: "venta", entidadId: ventaId, descripcion: `Devolución en la venta N.º ${v.numero}: $ ${(importe / 100).toLocaleString("es-AR")} (${d.forma === "vale" ? `vale ${codigo}` : d.forma === "cuenta_corriente" ? "saldo a favor" : "reintegro"}) — ${d.motivo.trim()}` });
    return { id: dev.id, importe, valeCodigo: codigo };
  });
}

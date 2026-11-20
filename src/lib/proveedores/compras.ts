/**
 * Compras a proveedores. Una compra se guarda TODA JUNTA (una transacción):
 *  - la compra y sus ítems;
 *  - el stock: piezas nuevas que se dan de alta, o unidades que se suman a un artículo existente (con su costo nuevo);
 *  - el metal comprado por gramo (cuenta de metal propio);
 *  - la cuenta corriente del proveedor (la factura) y, si es de contado, el pago;
 *  - la foto de las cotizaciones del momento y la auditoría.
 * Anular revierte todo (si las piezas no se vendieron) y deja rastro. Nada se borra.
 */
import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { compraItems, compras, db, movimientosCcProveedores, movimientosMetal, movimientosStock, pagoImputaciones, pagosProveedores, productos, proveedores, type Tx } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerUna } from "../config";
import { fotoCotizaciones } from "../cotizaciones/vigentes";
import { aMicro } from "../cotizaciones/tipos";
import { crearProducto, esquemaProducto, type DatosProducto } from "../stock/productos";
import { anularMovimientosDe, formatoMoneda, movimiento } from "../tesoreria/cajas";
import { emitirChequePropioTx, endosarChequeTx, revertirChequesDePago } from "../tesoreria/cheques";

export const TIPOS_COMPROBANTE = { A: "Factura A", B: "Factura B", C: "Factura C", X: "Comprobante interno / sin factura", R: "Remito" } as const;
export const MEDIOS_PAGO = { efectivo: "Efectivo", transferencia: "Transferencia", cheque: "Cheque", tarjeta: "Tarjeta", metal: "Metal (gramos)", otro: "Otro" } as const;

const itemPieza = z.object({
  tipo: z.literal("pieza"),
  /** Artículo que ya existe (se suman unidades) o null si es una pieza nueva. */
  productoId: z.number().int().positive().nullable(),
  nueva: z.any().nullable(),
  cantidad: z.number().int().min(1).max(100000),
  costoUnitario: z.number().int().min(0),
  ivaPct: z.number().int().min(0).max(2700),
});
const itemMetal = z.object({
  tipo: z.literal("metal"),
  leyId: z.number().int().positive(),
  pesoMg: z.number().int().min(1).max(1_000_000_000),
  /** Precio por GRAMO en centavos de la moneda de la compra. */
  costoUnitario: z.number().int().min(0),
  ivaPct: z.number().int().min(0).max(2700),
  descripcion: z.string().trim().max(120).optional(),
});

export const esquemaCompra = z.object({
  proveedorId: z.number().int().positive(),
  fecha: z.date(),
  tipoComprobante: z.enum(Object.keys(TIPOS_COMPROBANTE) as [keyof typeof TIPOS_COMPROBANTE]),
  puntoVenta: z.number().int().min(0).max(99999).nullable(),
  numero: z.number().int().min(0).max(99999999).nullable(),
  moneda: z.enum(["ARS", "USD", "EUR"]),
  tipoCambio: z.number().positive().max(1_000_000),
  condicion: z.enum(["contado", "cuenta_corriente"]),
  medioPago: z.enum(Object.keys(MEDIOS_PAGO) as [keyof typeof MEDIOS_PAGO]).optional(),
  vencimiento: z.date().nullable(),
  percepcionIva: z.number().int().min(0),
  percepcionIibb: z.number().int().min(0),
  otrosImpuestos: z.number().int().min(0),
  notas: z.string().trim().max(1000).optional(),
  items: z.array(z.discriminatedUnion("tipo", [itemPieza, itemMetal])).min(1, "Agregá al menos un ítem."),
  /** Módulo 6: de qué caja sale el pago de contado (o qué cheque). */
  cajaId: z.number().int().positive().nullable().optional(),
  chequeTerceroId: z.number().int().positive().nullable().optional(),
  chequePropio: z.object({ numero: z.string(), bancoCajaId: z.number().int(), fechaPago: z.date() }).nullable().optional(),
  exigirCaja: z.boolean().optional(),
});
export type DatosCompra = z.input<typeof esquemaCompra>;

/** IVA discriminado solo en facturas A (en B/C/X/remito el costo ya lo incluye o no corresponde). */
const discriminaIva = (tipo: string) => tipo === "A";

export function calcularTotales(d: Pick<DatosCompra, "tipoComprobante" | "percepcionIva" | "percepcionIibb" | "otrosImpuestos" | "items">) {
  let neto = 0;
  let iva = 0;
  const subtotales = d.items.map((it) => {
    const sub = it.tipo === "metal" ? Math.round((it.pesoMg / 1000) * it.costoUnitario) : it.cantidad * it.costoUnitario;
    neto += sub;
    if (discriminaIva(d.tipoComprobante)) iva += Math.round((sub * it.ivaPct) / 10000);
    return sub;
  });
  const total = neto + iva + (d.percepcionIva ?? 0) + (d.percepcionIibb ?? 0) + (d.otrosImpuestos ?? 0);
  return { neto, iva, total, subtotales };
}

/** Nuevo costo de un artículo existente: se reparte en sus componentes con las mismas proporciones. */
function costoRepartido(p: typeof productos.$inferSelect, nuevo: number) {
  const total = p.costoMetal + p.costoManoObra + p.costoPiedras + p.costoOtros;
  if (!total) return { costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: nuevo };
  const f = nuevo / total;
  const metal = Math.round(p.costoMetal * f);
  const mo = Math.round(p.costoManoObra * f);
  const pie = Math.round(p.costoPiedras * f);
  return { costoMetal: metal, costoManoObra: mo, costoPiedras: pie, costoOtros: nuevo - metal - mo - pie };
}

export async function registrarCompra(datos: DatosCompra, actor: Actor) {
  const r = esquemaCompra.safeParse(datos);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const d = r.data;
  if (d.moneda === "ARS") d.tipoCambio = 1;
  if (d.condicion === "contado" && !d.medioPago) throw new ErrorValidacion("Elegí con qué se pagó.");
  const { neto, iva, total, subtotales } = calcularTotales(d);
  if (total <= 0) throw new ErrorValidacion("El total de la compra tiene que ser mayor a cero.");
  const cotizaciones = JSON.stringify(await fotoCotizaciones());

  return db.transaction(async (tx) => {
    const [prov] = await tx.select().from(proveedores).where(eq(proveedores.id, d.proveedorId));
    if (!prov) throw new ErrorValidacion("El proveedor no existe.");
    if (d.numero != null && d.tipoComprobante !== "X") {
      const [rep] = await tx
        .select({ id: compras.id })
        .from(compras)
        .where(and(eq(compras.proveedorId, d.proveedorId), eq(compras.tipoComprobante, d.tipoComprobante), eq(compras.numero, d.numero), sql`coalesce(${compras.puntoVenta}, -1) = ${d.puntoVenta ?? -1}`, eq(compras.anulada, false)));
      if (rep) throw new ErrorValidacion("Ese comprobante de este proveedor ya está cargado.");
    }
    const vencimiento = d.condicion === "cuenta_corriente" ? (d.vencimiento ?? new Date(d.fecha.getTime() + prov.diasPago * 86400_000)) : null;
    const [c] = await tx
      .insert(compras)
      .values({
        proveedorId: d.proveedorId,
        fecha: d.fecha,
        tipoComprobante: d.tipoComprobante,
        puntoVenta: d.puntoVenta,
        numero: d.numero,
        moneda: d.moneda,
        tipoCambio: aMicro(d.tipoCambio),
        neto,
        iva,
        percepcionIva: d.percepcionIva,
        percepcionIibb: d.percepcionIibb,
        otrosImpuestos: d.otrosImpuestos,
        total,
        condicion: d.condicion,
        vencimiento,
        notas: d.notas || null,
        cotizaciones,
        usuarioId: actor.id,
      })
      .returning({ id: compras.id });
    const ref = `compra:${c.id}`;
    const nombreComp = `${TIPOS_COMPROBANTE[d.tipoComprobante]}${d.numero != null ? ` ${String(d.puntoVenta ?? 0).padStart(5, "0")}-${String(d.numero).padStart(8, "0")}` : ""}`;
    const ahora = new Date();

    for (const [i, it] of d.items.entries()) {
      if (it.tipo === "metal") {
        const pesoG = it.pesoMg / 1000;
        await tx.insert(compraItems).values({ compraId: c.id, tipo: "metal", descripcion: it.descripcion || "Metal", cantidad: 1, leyId: it.leyId, pesoMg: it.pesoMg, costoUnitario: it.costoUnitario, ivaPct: it.ivaPct, subtotal: subtotales[i] });
        await tx.insert(movimientosMetal).values({ fecha: d.fecha, leyId: it.leyId, pesoMg: it.pesoMg, tipo: "compra", costo: Math.round(subtotales[i] * d.tipoCambio), compraId: c.id, descripcion: `Compra a ${prov.razonSocial}: ${pesoG.toLocaleString("es-AR")} g`, usuarioId: actor.id });
        continue;
      }
      if (it.productoId) {
        const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId));
        if (!p) throw new ErrorValidacion(`Ítem ${i + 1}: la pieza no existe.`);
        if (p.tipo === "unica") throw new ErrorValidacion(`Ítem ${i + 1}: ${p.codigo} es una pieza única; las piezas únicas se cargan como nuevas.`);
        const cantidad = p.cantidad + it.cantidad;
        await tx
          .update(productos)
          .set({ cantidad, ...costoRepartido(p, it.costoUnitario), monedaCosto: d.moneda, proveedorId: d.proveedorId, estado: p.estado === "baja" ? "disponible" : p.estado, actualizadoEn: ahora })
          .where(eq(productos.id, p.id));
        await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "compra", cantidad: it.cantidad, stockResultante: cantidad, motivo: `Compra a ${prov.razonSocial} (${nombreComp})`, documento: ref, usuarioId: actor.id });
        await tx.insert(compraItems).values({ compraId: c.id, tipo: "pieza", productoId: p.id, descripcion: `${p.codigo} · ${p.nombre}`, cantidad: it.cantidad, costoUnitario: it.costoUnitario, ivaPct: it.ivaPct, subtotal: subtotales[i] });
      } else {
        const nueva = esquemaProducto.safeParse({
          ...(it.nueva as DatosProducto),
          origen: "compra",
          proveedorId: d.proveedorId,
          cantidad: it.cantidad,
          costoMetal: 0,
          costoManoObra: 0,
          costoPiedras: 0,
          costoOtros: it.costoUnitario,
          monedaCosto: d.moneda,
        });
        if (!nueva.success) throw new ErrorValidacion(`Ítem ${i + 1}: ${nueva.error.issues[0].message}`);
        const n = await crearProducto(nueva.data as DatosProducto, actor, { tx });
        await tx.update(movimientosStock).set({ documento: ref, motivo: `Compra a ${prov.razonSocial} (${nombreComp})` }).where(and(eq(movimientosStock.productoId, n.id), eq(movimientosStock.tipo, "alta")));
        await tx.insert(compraItems).values({ compraId: c.id, tipo: "pieza", productoId: n.id, productoNuevo: true, descripcion: `${n.codigo} · ${nueva.data.nombre}`, cantidad: it.cantidad, costoUnitario: it.costoUnitario, ivaPct: it.ivaPct, subtotal: subtotales[i] });
      }
    }

    // Cuenta corriente: la factura suma deuda; si es de contado, el pago la cancela en el acto.
    await tx.insert(movimientosCcProveedores).values({ proveedorId: d.proveedorId, fecha: d.fecha, tipo: "factura", moneda: d.moneda, importe: total, vencimiento, descripcion: nombreComp, compraId: c.id, usuarioId: actor.id });
    if (d.condicion === "contado") await registrarPagoTx(tx, d.proveedorId, { fecha: d.fecha, moneda: d.moneda, importe: total, medio: d.medioPago!, tipoCambio: d.tipoCambio, notas: `Pago de contado (${nombreComp})`, imputaciones: [{ compraId: c.id, importe: total }], sentido: "pago", cajaId: d.cajaId ?? null, chequePropio: d.chequePropio ?? null, chequeTerceroId: d.chequeTerceroId ?? null, exigirCaja: d.exigirCaja }, actor);

    await auditar(tx, actor, {
      accion: "alta",
      entidad: "compra",
      entidadId: c.id,
      descripcion: `Registró la compra a ${prov.razonSocial}: ${nombreComp} por ${d.moneda} ${(total / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })} (${d.condicion === "contado" ? "contado" : "cuenta corriente"}, ${d.items.length} ítems)`,
    });
    return c.id;
  });
}

/** Cuánto falta pagar de cada compra en cuenta corriente (total − pagos imputados vigentes). */
export async function pendientes(proveedorId: number, tx: Tx = db) {
  const filas = await tx
    .select({
      c: compras,
      pagado: sql<number>`coalesce((select sum(i.importe) from pago_imputaciones i join pagos_proveedores p on p.id = i.pago_id where i.compra_id = "compras"."id" and p.anulado = 0), 0)`,
    })
    .from(compras)
    .where(and(eq(compras.proveedorId, proveedorId), eq(compras.anulada, false)))
    .orderBy(compras.fecha);
  return filas.map((x) => ({ ...x.c, pagado: x.pagado, pendiente: x.c.total - x.pagado })).filter((x) => x.pendiente > 0);
}

type DatosPago = {
  fecha: Date;
  moneda: string;
  importe: number;
  medio: keyof typeof MEDIOS_PAGO;
  tipoCambio: number;
  notas?: string;
  imputaciones: { compraId: number; importe: number }[];
  sentido: "pago" | "cobro";
  /** Módulo 6: caja de donde sale (o a donde entra) el dinero. */
  cajaId?: number | null;
  /** Cheque de tercero en cartera que se endosa. */
  chequeTerceroId?: number | null;
  /** Cheque propio que se emite. */
  chequePropio?: { numero: string; bancoCajaId: number; fechaPago: Date } | null;
  /** Pago en metal: gramos de una ley (sale del metal propio). El importe es la valuación pactada. */
  metal?: { leyId: number; pesoMg: number } | null;
  /** Desde las pantallas: efectivo y transferencia tienen que salir de una caja. */
  exigirCaja?: boolean;
};

async function registrarPagoTx(tx: Tx, proveedorId: number, p: DatosPago, actor: Actor) {
  if (!Number.isInteger(p.importe) || p.importe <= 0) throw new ErrorValidacion("Indicá el importe.");
  if (!(p.medio in MEDIOS_PAGO)) throw new ErrorValidacion("Elegí el medio de pago.");
  if (p.sentido === "cobro" && p.imputaciones.length) throw new ErrorValidacion("Un cobro no se imputa a facturas de compra.");
  const totalImputado = p.imputaciones.reduce((s, i) => s + i.importe, 0);
  if (totalImputado > p.importe) throw new ErrorValidacion("Lo imputado supera el importe del pago.");
  if (p.imputaciones.length) {
    const pend = await pendientes(proveedorId, tx);
    for (const i of p.imputaciones) {
      const c = pend.find((x) => x.id === i.compraId);
      if (!c) throw new ErrorValidacion("Una de las facturas ya está pagada o no es de este proveedor.");
      if (c.moneda !== p.moneda) throw new ErrorValidacion("Solo se imputan facturas de la misma moneda que el pago.");
      if (i.importe <= 0 || i.importe > c.pendiente) throw new ErrorValidacion("Lo imputado a una factura supera lo que falta pagar.");
    }
  }
  const [pago] = await tx
    .insert(pagosProveedores)
    .values({ proveedorId, fecha: p.fecha, sentido: p.sentido, moneda: p.moneda, importe: p.importe, medio: p.medio, tipoCambio: aMicro(p.moneda === "ARS" ? 1 : p.tipoCambio), notas: p.notas || null, usuarioId: actor.id })
    .returning({ id: pagosProveedores.id });
  for (const i of p.imputaciones) await tx.insert(pagoImputaciones).values({ pagoId: pago.id, compraId: i.compraId, importe: i.importe });
  // Módulo 6: de dónde sale el pago.
  const [prov] = await tx.select().from(proveedores).where(eq(proveedores.id, proveedorId));
  if (p.medio === "cheque") {
    if (p.sentido !== "pago") throw new ErrorValidacion("Los cheques de terceros se reciben en Tesorería → Cheques.");
    if (p.moneda !== "ARS") throw new ErrorValidacion("Los cheques son en pesos.");
    if (p.chequeTerceroId) {
      const ch = await endosarChequeTx(tx, p.chequeTerceroId, proveedorId, pago.id, actor);
      if (ch.importe !== p.importe) throw new ErrorValidacion(`El cheque endosado es por ${formatoMoneda(ch.importe, "ARS")}: el pago tiene que ser por ese importe.`);
    } else if (p.chequePropio) await emitirChequePropioTx(tx, { ...p.chequePropio, importe: p.importe, proveedorId, pagoId: pago.id }, actor);
    else throw new ErrorValidacion("Elegí el cheque de la cartera que se endosa o cargá los datos del cheque propio.");
  } else if (p.medio === "metal") {
    if (p.sentido !== "pago") throw new ErrorValidacion("El pago en metal es solo para pagar.");
    if (!p.metal?.leyId || !p.metal.pesoMg || p.metal.pesoMg <= 0) throw new ErrorValidacion("Indicá la ley y los gramos que se entregan.");
    const [disp] = await tx.select({ mg: sql<number>`coalesce(sum(${movimientosMetal.pesoMg}), 0)` }).from(movimientosMetal).where(and(eq(movimientosMetal.leyId, p.metal.leyId), eq(movimientosMetal.anulado, false)));
    if (disp.mg < p.metal.pesoMg) throw new ErrorValidacion(`No hay tanto metal propio de esa ley (hay ${(disp.mg / 1000).toLocaleString("es-AR")} g).`);
    await tx.insert(movimientosMetal).values({ fecha: p.fecha, leyId: p.metal.leyId, pesoMg: -p.metal.pesoMg, tipo: "pago_metal", costo: null, descripcion: `Pago en metal a ${prov?.razonSocial} (pago:${pago.id})`, usuarioId: actor.id });
  } else if (p.cajaId) {
    await movimiento(tx, { cajaId: p.cajaId, tipo: "pago_proveedor", importe: p.sentido === "pago" ? -p.importe : p.importe, descripcion: `${p.sentido === "pago" ? "Pago a" : "Cobro a"} ${prov?.razonSocial}${p.notas ? ` — ${p.notas}` : ""}`, referencia: `pago:${pago.id}`, moneda: p.moneda, fecha: p.fecha }, actor);
    await tx.update(pagosProveedores).set({ cajaId: p.cajaId }).where(eq(pagosProveedores.id, pago.id));
  } else if (p.exigirCaja && ["efectivo", "transferencia"].includes(p.medio)) throw new ErrorValidacion("Elegí la caja o cuenta de donde sale el pago.");
  await tx.insert(movimientosCcProveedores).values({
    proveedorId,
    fecha: p.fecha,
    tipo: p.sentido,
    moneda: p.moneda,
    // pago: baja lo que le debemos; cobro: baja lo que nos debe
    importe: p.sentido === "pago" ? -p.importe : p.importe,
    descripcion: `${p.sentido === "pago" ? "Pago" : "Cobro"} en ${MEDIOS_PAGO[p.medio].toLowerCase()}${p.notas ? ` — ${p.notas}` : ""}`,
    pagoId: pago.id,
    usuarioId: actor.id,
  });
  return pago.id;
}

/** Pago a un proveedor (o cobro a un tercero), con imputación a facturas. */
export async function registrarPago(proveedorId: number, p: DatosPago, actor: Actor) {
  return db.transaction(async (tx) => {
    const [prov] = await tx.select().from(proveedores).where(eq(proveedores.id, proveedorId));
    if (!prov) throw new ErrorValidacion("El proveedor no existe.");
    const id = await registrarPagoTx(tx, proveedorId, p, actor);
    await auditar(tx, actor, {
      accion: "alta",
      entidad: "pago_proveedor",
      entidadId: id,
      descripcion: `${p.sentido === "pago" ? "Pagó a" : "Cobró a"} ${prov.razonSocial}: ${p.moneda} ${(p.importe / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })} en ${MEDIOS_PAGO[p.medio].toLowerCase()}${p.imputaciones.length ? ` (imputado a ${p.imputaciones.length} factura/s)` : ""}`,
    });
    return id;
  });
}

export async function anularPago(pagoId: number, motivo: string, actor: Actor) {
  if (motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo de la anulación.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(pagosProveedores).where(eq(pagosProveedores.id, pagoId));
    if (!p || p.anulado) throw new ErrorValidacion("El pago no existe o ya estaba anulado.");
    await tx.update(pagosProveedores).set({ anulado: true }).where(eq(pagosProveedores.id, pagoId));
    await tx.update(movimientosCcProveedores).set({ anulado: true }).where(eq(movimientosCcProveedores.pagoId, pagoId));
    // Módulo 6: vuelve el dinero a la caja, el cheque a la cartera (o se anula el propio) y el metal.
    await revertirChequesDePago(tx, pagoId);
    await anularMovimientosDe(tx, [`pago:${pagoId}`]);
    await tx.update(movimientosMetal).set({ anulado: true }).where(and(eq(movimientosMetal.tipo, "pago_metal"), like(movimientosMetal.descripcion, `%(pago:${pagoId})`)));
    await auditar(tx, actor, { accion: "anulacion", entidad: "pago_proveedor", entidadId: pagoId, descripcion: `Anuló un ${p.sentido} de ${p.moneda} ${(p.importe / 100).toLocaleString("es-AR")} (${motivo.trim()})` });
  });
}

/** Anula una compra y revierte stock, metal y cuenta corriente. Falla si alguna pieza ya se vendió o movió. */
export async function anularCompra(id: number, motivo: string, actor: Actor) {
  if (motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo de la anulación.");
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(compras).where(eq(compras.id, id));
    if (!c || c.anulada) throw new ErrorValidacion("La compra no existe o ya está anulada.");
    const imputadas = await tx
      .select({ pagoId: pagoImputaciones.pagoId, notas: pagosProveedores.notas })
      .from(pagoImputaciones)
      .innerJoin(pagosProveedores, eq(pagosProveedores.id, pagoImputaciones.pagoId))
      .where(and(eq(pagoImputaciones.compraId, id), eq(pagosProveedores.anulado, false)));
    // El pago automático de contado se anula junto con la compra; otros pagos hay que anularlos antes.
    const otros = imputadas.filter((x) => !(c.condicion === "contado" && x.notas?.startsWith("Pago de contado")));
    if (otros.length) throw new ErrorValidacion("Esta compra tiene pagos imputados: anulá primero esos pagos.");
    const items = await tx.select().from(compraItems).where(eq(compraItems.compraId, id));
    const ahora = new Date();
    const ref = `compra:${id}`;
    for (const it of items.filter((x) => x.tipo === "pieza" && x.productoId)) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId!));
      if (it.productoNuevo) {
        if (!["disponible"].includes(p.estado) || (p.tipo !== "unica" && p.cantidad !== it.cantidad))
          throw new ErrorValidacion(`${p.codigo} ya no está como ingresó (está ${p.estado}${p.tipo !== "unica" ? `, ${p.cantidad} u.` : ""}): no se puede anular la compra.`);
        await tx.update(productos).set({ estado: "baja", cantidad: 0, actualizadoEn: ahora }).where(eq(productos.id, p.id));
        await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "ajuste", cantidad: -p.cantidad, stockResultante: 0, estadoAntes: p.estado, estadoDespues: "baja", motivo: `Anulación de la compra (${motivo.trim()})`, documento: ref, usuarioId: actor.id, autorizadoPor: actor.id });
      } else {
        if (p.cantidad < it.cantidad && !(await leerUna("stock.permitir_negativo"))) throw new ErrorValidacion(`${p.codigo}: ya no hay ${it.cantidad} unidades para descontar.`);
        await tx.update(productos).set({ cantidad: p.cantidad - it.cantidad, actualizadoEn: ahora }).where(eq(productos.id, p.id));
        await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "ajuste", cantidad: -it.cantidad, stockResultante: p.cantidad - it.cantidad, motivo: `Anulación de la compra (${motivo.trim()})`, documento: ref, usuarioId: actor.id, autorizadoPor: actor.id });
      }
    }
    await tx.update(movimientosMetal).set({ anulado: true }).where(eq(movimientosMetal.compraId, id));
    await tx.update(movimientosCcProveedores).set({ anulado: true }).where(eq(movimientosCcProveedores.compraId, id));
    for (const x of imputadas) {
      await tx.update(pagosProveedores).set({ anulado: true }).where(eq(pagosProveedores.id, x.pagoId));
      await tx.update(movimientosCcProveedores).set({ anulado: true }).where(eq(movimientosCcProveedores.pagoId, x.pagoId));
    }
    await tx.update(compras).set({ anulada: true, anuladaPor: actor.id, motivoAnulacion: motivo.trim() }).where(eq(compras.id, id));
    await auditar(tx, actor, { accion: "anulacion", entidad: "compra", entidadId: id, descripcion: `Anuló la compra #${id} (${motivo.trim()}): se revirtieron stock, metal y cuenta corriente` });
  });
}

export async function obtenerCompra(id: number) {
  const [c] = await db.select({ c: compras, proveedor: proveedores.razonSocial }).from(compras).innerJoin(proveedores, eq(proveedores.id, compras.proveedorId)).where(eq(compras.id, id));
  if (!c) return null;
  const [items, pagos] = await Promise.all([
    db.select().from(compraItems).where(eq(compraItems.compraId, id)),
    db
      .select({ i: pagoImputaciones, p: pagosProveedores })
      .from(pagoImputaciones)
      .innerJoin(pagosProveedores, eq(pagosProveedores.id, pagoImputaciones.pagoId))
      .where(eq(pagoImputaciones.compraId, id)),
  ]);
  const pagado = pagos.filter((x) => !x.p.anulado).reduce((s, x) => s + x.i.importe, 0);
  return { ...c.c, proveedor: c.proveedor, items, pagos, pagado, pendiente: c.c.anulada ? 0 : c.c.total - pagado };
}

export async function listarCompras(f: { proveedorId?: number; desde?: Date; hasta?: Date; incluirAnuladas?: boolean; limite?: number }) {
  return db
    .select({ c: compras, proveedor: proveedores.razonSocial })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .where(
      and(
        f.proveedorId ? eq(compras.proveedorId, f.proveedorId) : undefined,
        f.desde ? sql`${compras.fecha} >= ${f.desde.getTime()}` : undefined,
        f.hasta ? sql`${compras.fecha} <= ${f.hasta.getTime()}` : undefined,
        f.incluirAnuladas ? undefined : eq(compras.anulada, false),
      ),
    )
    .orderBy(desc(compras.fecha), desc(compras.id))
    .limit(f.limite ?? 200);
}

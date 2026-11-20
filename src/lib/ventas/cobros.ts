/**
 * Cobros: varios medios en una misma operación (efectivo en pesos o divisas, transferencia, QR, débito, crédito
 * en cuotas, gift card, saldo a favor y cuenta corriente con plan de pagos). Cada medio puede tener recargo o
 * descuento sobre la parte que se paga con él. Se usa desde ventas, señas y cobros de cuenta corriente,
 * siempre dentro de la transacción de la operación.
 */
import { and, eq, sql } from "drizzle-orm";
import { clientes, cobros, db, mediosPago, movimientosCcClientes, planesCuotas, type Tx } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { aMicro } from "../cotizaciones/tipos";
import { obtenerVigentes } from "../cotizaciones/vigentes";
import { leerUna } from "../config";
import { usarVale } from "./vales";
import { cobroACaja } from "../tesoreria/acreditaciones";

export type PagoIn = {
  medioId: number;
  /** Cuánto de la deuda cancela este pago (centavos de pesos). */
  aplicado: number;
  cuotas?: number | null;
  valeCodigo?: string | null;
  /** Pesos por unidad de la divisa (si el medio es en dólares/euros). Vacío = dólar de referencia (compra). */
  tipoCambio?: number | null;
  /** Cuenta corriente en N cuotas mensuales (plan de pagos). */
  planCc?: number | null;
  /** Para «saldo a favor»: la seña de qué operación se usa (reserva:ID | pedido:ID | reparacion:ID). */
  senaRef?: string | null;
};

/** Seña disponible de una operación: lo señado menos lo que ya se usó. */
export async function senaDisponible(ref: string, tx: Tx = db) {
  const [{ s }] = await tx
    .select({ s: sql<number>`coalesce(sum(case when ${cobros.origen} = 'sena' then ${cobros.aplicado} when ${cobros.medioTipo} = 'saldo_favor' then -${cobros.aplicado} else 0 end), 0)` })
    .from(cobros)
    .where(and(eq(cobros.referencia, ref), eq(cobros.anulado, false)));
  return s;
}

/** Cotización para recibir divisas: la de COMPRA del dólar de referencia / euro oficial. */
export async function cotizacionesCobro() {
  const v = await obtenerVigentes();
  const ref = await leerUna("cotizaciones.dolar_referencia");
  return { USD: v[ref].compra ?? v[ref].venta, EUR: v.EUR_OFICIAL.compra ?? v.EUR_OFICIAL.venta };
}

/** Recargo/descuento y lo que se cobra en la moneda del medio (sin base de datos: para la pantalla y las pruebas). */
export function calcularPago(aplicado: number, ajustePct: number, moneda: string, tipoCambio: number) {
  const recargo = Math.round((aplicado * ajustePct) / 10000);
  const cobradoArs = aplicado + recargo;
  const importe = moneda === "ARS" ? cobradoArs : Math.round(cobradoArs / tipoCambio);
  return { recargo, cobradoArs, importe };
}

export async function saldoCliente(clienteId: number, tx: Tx = db) {
  const [{ s }] = await tx.select({ s: sql<number>`coalesce(sum(${movimientosCcClientes.importe}), 0)` }).from(movimientosCcClientes).where(and(eq(movimientosCcClientes.clienteId, clienteId), eq(movimientosCcClientes.anulado, false)));
  return s;
}

/**
 * Registra los pagos. Devuelve el total de recargos y lo que quedó en cuenta corriente.
 * `total`: lo que hay que cubrir; la suma de lo aplicado tiene que ser exactamente eso.
 */
export async function procesarPagos(
  tx: Tx,
  o: { clienteId: number | null; ventaId: number | null; origen: "venta" | "sena" | "cobro_cc"; referencia: string | null; documento: string; pagos: PagoIn[]; total: number; actor: Actor; cot: { USD: number | null; EUR: number | null } },
) {
  const suma = o.pagos.reduce((s, p) => s + p.aplicado, 0);
  if (suma !== o.total) throw new ErrorValidacion(suma < o.total ? `Falta cobrar $ ${((o.total - suma) / 100).toLocaleString("es-AR")}.` : "Los pagos superan el total.");
  let recargos = 0;
  let aCc = 0;
  const ahora = new Date();
  for (const p of o.pagos) {
    if (!Number.isInteger(p.aplicado) || p.aplicado <= 0) throw new ErrorValidacion("Hay un pago sin importe.");
    const [m] = await tx.select().from(mediosPago).where(and(eq(mediosPago.id, p.medioId), eq(mediosPago.activo, true)));
    if (!m) throw new ErrorValidacion("Medio de cobro no válido.");
    let ajuste = m.ajustePct;
    if (m.tipo === "credito") {
      const cuotas = p.cuotas ?? 1;
      const [plan] = await tx.select().from(planesCuotas).where(and(eq(planesCuotas.medioId, m.id), eq(planesCuotas.cuotas, cuotas), eq(planesCuotas.activo, true)));
      if (!plan) throw new ErrorValidacion(`No hay un plan de ${cuotas} cuotas activo para ${m.nombre}.`);
      ajuste += plan.recargoPct;
    }
    if (m.tipo === "cuenta_corriente") {
      if (o.origen !== "venta") throw new ErrorValidacion("La cuenta corriente solo se usa en ventas.");
      if (!o.clienteId) throw new ErrorValidacion("Para dejar en cuenta corriente hay que elegir el cliente.");
      const n = Math.max(1, Math.min(36, p.planCc ?? 1));
      const base = Math.floor(p.aplicado / n);
      for (let i = 0; i < n; i++) {
        const vence = new Date(ahora);
        vence.setMonth(vence.getMonth() + i + 1);
        const importe = i === n - 1 ? p.aplicado - base * (n - 1) : base;
        await tx.insert(movimientosCcClientes).values({ clienteId: o.clienteId, fecha: ahora, tipo: "venta", importe, vencimiento: vence, descripcion: n > 1 ? `Cuota ${i + 1} de ${n}` : "Venta en cuenta corriente", documento: o.documento, usuarioId: o.actor.id });
      }
      aCc += p.aplicado;
      continue;
    }
    if (m.tipo === "saldo_favor") {
      if (!o.clienteId) throw new ErrorValidacion("Para usar el saldo a favor hay que elegir el cliente.");
      if (o.origen !== "venta") throw new ErrorValidacion("El saldo a favor se usa en ventas.");
      if (p.senaRef) {
        // Seña de una operación puntual: se usa aunque el cliente tenga otras deudas.
        const disp = await senaDisponible(p.senaRef, tx);
        if (disp < p.aplicado) throw new ErrorValidacion(`La seña disponible es $ ${(Math.max(0, disp) / 100).toLocaleString("es-AR")}.`);
      } else {
        const saldo = await saldoCliente(o.clienteId, tx);
        if (-saldo < p.aplicado) throw new ErrorValidacion(`El cliente tiene $ ${(Math.max(0, -saldo) / 100).toLocaleString("es-AR")} a favor.`);
      }
      await tx.insert(movimientosCcClientes).values({ clienteId: o.clienteId, fecha: ahora, tipo: "venta", importe: p.aplicado, descripcion: p.senaRef ? `Se usó la seña (${p.senaRef})` : "Se usó el saldo a favor", documento: o.documento, usuarioId: o.actor.id });
    }
    let valeId: number | null = null;
    if (m.tipo === "vale") {
      if (!p.valeCodigo) throw new ErrorValidacion("Escribí el código del vale o gift card.");
      valeId = await usarVale(tx, p.valeCodigo, p.aplicado, o.ventaId);
    }
    const tc = m.moneda === "ARS" ? 1 : (p.tipoCambio ?? (m.moneda === "USD" ? o.cot.USD : o.cot.EUR));
    if (!tc) throw new ErrorValidacion(`Falta la cotización para cobrar en ${m.moneda}.`);
    const c = calcularPago(p.aplicado, ajuste, m.moneda, tc);
    recargos += c.recargo;
    const [cobro] = await tx.insert(cobros).values({
      fecha: ahora,
      clienteId: o.clienteId,
      ventaId: o.ventaId,
      origen: o.origen,
      referencia: m.tipo === "saldo_favor" ? (p.senaRef ?? null) : o.referencia,
      medioId: m.id,
      medioTipo: m.tipo,
      moneda: m.moneda,
      importe: c.importe,
      tipoCambio: aMicro(tc),
      aplicado: p.aplicado,
      recargo: c.recargo,
      cuotas: m.tipo === "credito" ? (p.cuotas ?? 1) : null,
      valeId,
      usuarioId: o.actor.id,
    }).returning();
    // Módulo 6: lo cobrado entra en la caja del medio (y, si es tarjeta, queda a acreditar).
    await cobroACaja(tx, cobro, o.actor);
  }
  return { recargos, aCc };
}

/** Seña (reserva, pedido, reparación) o cobro de cuenta corriente: queda como saldo a favor / cancela deuda. */
export async function registrarCobroCliente(clienteId: number, o: { origen: "sena" | "cobro_cc"; referencia: string | null; descripcion: string; pagos: PagoIn[] }, actor: Actor, txExterna?: Tx) {
  const total = o.pagos.reduce((s, p) => s + p.aplicado, 0);
  if (total <= 0) throw new ErrorValidacion("Indicá el importe.");
  const cot = await cotizacionesCobro();
  const ejecutar = async (tx: Tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
    if (!c) throw new ErrorValidacion("El cliente no existe.");
    for (const p of o.pagos) {
      const [m] = await tx.select().from(mediosPago).where(eq(mediosPago.id, p.medioId));
      if (m && ["cuenta_corriente", "saldo_favor"].includes(m.tipo)) throw new ErrorValidacion(`No se puede cobrar con «${m.nombre}».`);
    }
    await procesarPagos(tx, { clienteId, ventaId: null, origen: o.origen, referencia: o.referencia, documento: o.referencia ?? "cobro", pagos: o.pagos, total, actor, cot });
    await tx.insert(movimientosCcClientes).values({ clienteId, fecha: new Date(), tipo: "cobro", importe: -total, descripcion: o.descripcion, documento: o.referencia, usuarioId: actor.id });
    await auditar(tx, actor, { accion: "alta", entidad: "cobro", entidadId: clienteId, descripcion: `${o.origen === "sena" ? "Seña" : "Cobro de cuenta corriente"} de ${c.nombre}: $ ${(total / 100).toLocaleString("es-AR")} (${o.descripcion})` });
    return total;
  };
  return txExterna ? ejecutar(txExterna) : db.transaction(ejecutar);
}

/** Señas de operaciones en curso de un cliente (forman parte de su saldo a favor). */
export async function senasDeCliente(clienteId: number) {
  const filas = await db
    .select({ ref: cobros.referencia, s: sql<number>`sum(case when ${cobros.origen} = 'sena' then ${cobros.aplicado} when ${cobros.medioTipo} = 'saldo_favor' then -${cobros.aplicado} else 0 end)` })
    .from(cobros)
    .where(and(eq(cobros.clienteId, clienteId), eq(cobros.anulado, false), sql`${cobros.referencia} is not null`))
    .groupBy(cobros.referencia);
  return filas.filter((f) => f.ref && f.s > 0).map((f) => ({ ref: f.ref!, disponible: f.s }));
}

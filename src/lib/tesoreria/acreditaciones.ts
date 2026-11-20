/**
 * Cobros que pasan por una caja: cada cobro del mostrador (venta, seña, cuenta corriente) entra en la caja de su
 * medio. Los cobros con tarjeta quedan en «Tarjetas a acreditar» hasta que la procesadora los deposita en el
 * banco, descontando su comisión y las retenciones (fecha esperada vs. real).
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { acreditaciones, cajas, categoriasTesoreria, clientes, cobros, db, mediosPago, movimientosCaja, ventas, type Tx } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { formatoMoneda, movimiento, obtenerCaja } from "./cajas";

/** Llamado por procesarPagos dentro de su transacción, con el cobro ya guardado. */
export async function cobroACaja(tx: Tx, c: typeof cobros.$inferSelect, actor: Actor) {
  const [m] = await tx.select().from(mediosPago).where(eq(mediosPago.id, c.medioId));
  if (!m?.cajaId) return;
  const caja = await obtenerCaja(m.cajaId, tx);
  if (!caja || !caja.activa) throw new ErrorValidacion(`El medio «${m.nombre}» está asociado a una caja inactiva: revisalo en Tesorería → Cajas.`);
  if (caja.moneda !== c.moneda) throw new ErrorValidacion(`El medio «${m.nombre}» cobra en ${c.moneda} pero su caja «${caja.nombre}» es en ${caja.moneda}: revisalo en Tesorería → Cajas.`);
  let origen = "Cobro";
  if (c.ventaId) {
    const [v] = await tx.select({ n: ventas.numero }).from(ventas).where(eq(ventas.id, c.ventaId));
    origen = `Venta N.º ${String(v?.n ?? c.ventaId).padStart(6, "0")}`;
  } else if (c.origen === "sena") origen = `Seña (${(c.referencia ?? "").replace(":", " ")})`;
  else if (c.origen === "cobro_cc") origen = "Cobro de cuenta corriente";
  const [cli] = c.clienteId ? await tx.select({ n: clientes.nombre }).from(clientes).where(eq(clientes.id, c.clienteId)) : [];
  const texto = `${origen}${cli ? ` · ${cli.n}` : ""} · ${m.nombre}${c.cuotas && c.cuotas > 1 ? ` en ${c.cuotas} cuotas` : ""}`;
  await movimiento(tx, { cajaId: caja.id, tipo: "cobro", importe: c.importe, descripcion: texto, referencia: `cobro:${c.id}`, fecha: c.fecha }, actor);
  if (caja.tipo === "tarjetas") {
    const esperada = new Date(c.fecha.getTime() + caja.diasAcreditacion * 86400_000);
    await tx.insert(acreditaciones).values({ cobroId: c.id, cajaId: caja.id, fecha: c.fecha, cuotas: c.cuotas, bruto: c.importe, fechaEsperada: esperada });
  }
}

/** Al anular cobros (por ejemplo, una venta): salen de su caja. Si la tarjeta ya se acreditó, queda la devolución pendiente. */
export async function anularCobrosEnCaja(tx: Tx, cobroIds: number[], actor: Actor) {
  if (!cobroIds.length) return;
  const refs = cobroIds.map((id) => `cobro:${id}`);
  const acs = await tx.select().from(acreditaciones).where(inArray(acreditaciones.cobroId, cobroIds));
  const acreditadas = acs.filter((a) => a.estado === "acreditada");
  // Lo pendiente de acreditar simplemente no va a llegar: se anula. Lo ya acreditado lo descuenta la procesadora.
  const refsAnular = refs.filter((r) => !acreditadas.some((a) => `cobro:${a.cobroId}` === r));
  await tx.update(movimientosCaja).set({ anulado: true }).where(and(inArray(movimientosCaja.referencia, refsAnular), eq(movimientosCaja.anulado, false)));
  const pendientes = acs.filter((a) => a.estado === "pendiente").map((a) => a.id);
  if (pendientes.length) await tx.update(acreditaciones).set({ estado: "anulada" }).where(inArray(acreditaciones.id, pendientes));
  for (const a of acreditadas) await movimiento(tx, { cajaId: a.cajaId, tipo: "cobro", importe: -a.bruto, descripcion: "Contracargo: se anuló una venta con tarjeta ya acreditada (la procesadora lo descuenta)", referencia: `contracargo:${a.cobroId}` }, actor);
}

export async function listarAcreditaciones(estado: "pendiente" | "acreditada" | "todas" = "pendiente") {
  return db
    .select({ a: acreditaciones, caja: cajas.nombre, cliente: clientes.nombre, ventaId: cobros.ventaId, medio: mediosPago.nombre })
    .from(acreditaciones)
    .innerJoin(cajas, eq(cajas.id, acreditaciones.cajaId))
    .innerJoin(cobros, eq(cobros.id, acreditaciones.cobroId))
    .innerJoin(mediosPago, eq(mediosPago.id, cobros.medioId))
    .leftJoin(clientes, eq(clientes.id, cobros.clienteId))
    .where(estado === "todas" ? undefined : eq(acreditaciones.estado, estado))
    .orderBy(asc(acreditaciones.fechaEsperada))
    .limit(500);
}

/**
 * Registra una liquidación de la procesadora: las acreditaciones elegidas pasan al banco por el NETO; la comisión y
 * las retenciones quedan como gastos (Comisiones / Retenciones de tarjetas). Comisión = bruto − neto − retenciones.
 */
export async function acreditar(d: { ids: number[]; neto: number; retencion: number; fecha: Date; bancoId: number }, actor: Actor) {
  if (!d.ids.length) throw new ErrorValidacion("Elegí qué cupones se acreditaron.");
  if (!Number.isInteger(d.neto) || d.neto <= 0) throw new ErrorValidacion("Indicá cuánto llegó al banco.");
  if (!Number.isInteger(d.retencion) || d.retencion < 0) throw new ErrorValidacion("Retenciones no válidas.");
  return db.transaction(async (tx) => {
    const acs = await tx.select().from(acreditaciones).where(inArray(acreditaciones.id, d.ids));
    if (acs.length !== d.ids.length || acs.some((a) => a.estado !== "pendiente")) throw new ErrorValidacion("Alguno de los cupones ya se acreditó o se anuló.");
    if (new Set(acs.map((a) => a.cajaId)).size > 1) throw new ErrorValidacion("Elegí cupones de una sola caja de tarjetas.");
    const bruto = acs.reduce((s, a) => s + a.bruto, 0);
    const comision = bruto - d.neto - d.retencion;
    if (comision < 0) throw new ErrorValidacion(`Lo acreditado más las retenciones (${formatoMoneda(d.neto + d.retencion, "ARS")}) supera el total de los cupones (${formatoMoneda(bruto, "ARS")}).`);
    const tarjetas = (await obtenerCaja(acs[0].cajaId, tx))!;
    const banco = await obtenerCaja(d.bancoId, tx);
    if (!banco || banco.moneda !== "ARS") throw new ErrorValidacion("Elegí el banco (en pesos) donde se acreditó.");
    const cat = async (nombre: string) => (await tx.select().from(categoriasTesoreria).where(like(categoriasTesoreria.nombre, `${nombre}%`)))[0]?.id ?? null;
    const grupo = randomUUID();
    const ref = `liquidacion:${grupo.slice(0, 8)}`;
    const texto = `Liquidación de ${acs.length} cupón/es (${formatoMoneda(bruto, "ARS")})`;
    await movimiento(tx, { cajaId: tarjetas.id, tipo: "acreditacion", importe: -d.neto, descripcion: `${texto}: acreditado en «${banco.nombre}»`, referencia: ref, grupo, fecha: d.fecha }, actor);
    await movimiento(tx, { cajaId: banco.id, tipo: "acreditacion", importe: d.neto, descripcion: `${texto} de «${tarjetas.nombre}»`, referencia: ref, grupo, fecha: d.fecha }, actor);
    if (comision > 0) await movimiento(tx, { cajaId: tarjetas.id, tipo: "gasto", importe: -comision, descripcion: `Comisión de la procesadora · ${texto}`, referencia: ref, categoriaId: await cat("Comisiones"), grupo, fecha: d.fecha }, actor);
    if (d.retencion > 0) await movimiento(tx, { cajaId: tarjetas.id, tipo: "gasto", importe: -d.retencion, descripcion: `Retenciones · ${texto}`, referencia: ref, categoriaId: await cat("Retenciones"), grupo, fecha: d.fecha }, actor);
    for (const a of acs) {
      const parte = a.bruto / bruto;
      await tx
        .update(acreditaciones)
        .set({ estado: "acreditada", fechaReal: d.fecha, bancoId: banco.id, neto: Math.round(d.neto * parte), comision: Math.round(comision * parte), retencion: Math.round(d.retencion * parte) })
        .where(eq(acreditaciones.id, a.id));
    }
    await auditar(tx, actor, { accion: "alta", entidad: "acreditacion", descripcion: `${texto}: neto ${formatoMoneda(d.neto, "ARS")}, comisión ${formatoMoneda(comision, "ARS")}, retenciones ${formatoMoneda(d.retencion, "ARS")} → «${banco.nombre}»` });
    return { bruto, comision };
  });
}

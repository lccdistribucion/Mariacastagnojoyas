/**
 * Cheques. De terceros: se reciben (de un cliente, que cancela su cuenta corriente, o por otro ingreso), quedan
 * en la caja «Cheques en cartera» y se depositan, se endosan a un proveedor o se rechazan.
 * Propios: se emiten al pagar a un proveedor y se debitan del banco el día de pago.
 */
import { and, asc, desc, eq, inArray, like, lte, sql } from "drizzle-orm";
import { cajas, cheques, clientes, db, movimientosCaja, movimientosCcClientes, movimientosCcProveedores, proveedores, type Tx } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { soloDigitos } from "../identidad";
import { formatoMoneda, movimiento } from "./cajas";

export const ESTADOS_CHEQUE: Record<string, string> = { en_cartera: "En cartera", depositado: "Depositado", endosado: "Endosado", rechazado: "Rechazado", emitido: "Emitido", debitado: "Debitado", anulado: "Anulado" };

export async function cajaCartera(tx: Tx = db) {
  const [c] = await tx.select().from(cajas).where(and(eq(cajas.tipo, "cheques"), eq(cajas.activa, true))).orderBy(asc(cajas.orden)).limit(1);
  if (!c) throw new ErrorValidacion("Falta la caja «Cheques en cartera» (Tesorería → Cajas).");
  return c;
}

const titulo = (c: { numero: string; banco: string }) => `cheque N.º ${c.numero} (${c.banco})`;

export type DatosCheque = { numero: string; banco: string; librador?: string; cuit?: string; importe: number; fechaEmision: Date; fechaPago: Date; notas?: string };
function validar(d: DatosCheque) {
  if (!d.numero.trim()) throw new ErrorValidacion("Escribí el número del cheque.");
  if (d.banco.trim().length < 2) throw new ErrorValidacion("Escribí el banco del cheque.");
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new ErrorValidacion("Indicá el importe del cheque.");
  if (Number.isNaN(d.fechaPago.getTime()) || Number.isNaN(d.fechaEmision.getTime())) throw new ErrorValidacion("Revisá las fechas del cheque.");
  if (d.fechaPago.getTime() < d.fechaEmision.getTime() - 86400_000) throw new ErrorValidacion("La fecha de pago no puede ser anterior a la de emisión.");
}

/** Cheque de tercero recibido. Si es de un cliente, cancela su cuenta corriente; si no, es un ingreso con su categoría. */
export async function recibirCheque(d: DatosCheque & { clienteId?: number | null; categoriaId?: number | null; detalle?: string }, actor: Actor) {
  validar(d);
  if (!d.clienteId && !d.categoriaId) throw new ErrorValidacion("Indicá de qué cliente es o elegí la categoría del ingreso.");
  return db.transaction(async (tx) => {
    const cartera = await cajaCartera(tx);
    const [cli] = d.clienteId ? await tx.select().from(clientes).where(eq(clientes.id, d.clienteId)) : [];
    if (d.clienteId && !cli) throw new ErrorValidacion("El cliente no existe.");
    const [ch] = await tx
      .insert(cheques)
      .values({ tipo: "tercero", numero: d.numero.trim(), banco: d.banco.trim(), librador: d.librador?.trim() || null, cuit: d.cuit ? soloDigitos(d.cuit) || null : null, importe: d.importe, fechaEmision: d.fechaEmision, fechaPago: d.fechaPago, estado: "en_cartera", clienteId: d.clienteId ?? null, notas: d.notas?.trim() || null, creadoEn: new Date(), usuarioId: actor.id })
      .returning();
    const t = titulo(ch);
    await movimiento(tx, { cajaId: cartera.id, tipo: cli ? "cheque" : "ingreso", importe: d.importe, descripcion: `Recibido ${t}${cli ? ` de ${cli.nombre}` : d.detalle?.trim() ? ` · ${d.detalle.trim()}` : ""}`, referencia: `cheque:${ch.id}`, categoriaId: cli ? null : (d.categoriaId ?? null) }, actor);
    if (cli) await tx.insert(movimientosCcClientes).values({ clienteId: cli.id, fecha: new Date(), tipo: "cobro", importe: -d.importe, descripcion: `Pago con ${t}`, documento: `cheque:${ch.id}`, usuarioId: actor.id });
    await auditar(tx, actor, { accion: "alta", entidad: "cheque", entidadId: ch.id, descripcion: `Recibió el ${t} por ${formatoMoneda(d.importe, "ARS")}${cli ? ` de ${cli.nombre}` : ""}, paga el ${d.fechaPago.toLocaleDateString("es-AR")}` });
    return ch.id;
  });
}

async function cheque(tx: Tx, id: number) {
  const [c] = await tx.select().from(cheques).where(eq(cheques.id, id));
  if (!c) throw new ErrorValidacion("El cheque no existe.");
  return c;
}

/** Depositar un cheque de la cartera en un banco. */
export async function depositarCheque(id: number, bancoId: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const c = await cheque(tx, id);
    if (c.estado !== "en_cartera") throw new ErrorValidacion("Solo se depositan cheques en cartera.");
    const cartera = await cajaCartera(tx);
    const t = titulo(c);
    const { caja } = await movimiento(tx, { cajaId: bancoId, tipo: "cheque", importe: c.importe, descripcion: `Depósito del ${t}`, referencia: `cheque:${c.id}`, moneda: "ARS" }, actor);
    if (caja.tipo !== "banco") throw new ErrorValidacion("Elegí una cuenta bancaria.");
    await movimiento(tx, { cajaId: cartera.id, tipo: "cheque", importe: -c.importe, descripcion: `Depositado en «${caja.nombre}»: ${t}`, referencia: `cheque:${c.id}` }, actor);
    await tx.update(cheques).set({ estado: "depositado", bancoCajaId: bancoId }).where(eq(cheques.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "cheque", entidadId: id, descripcion: `Depositó el ${t} en «${caja.nombre}»` });
  });
}

/** Endoso a un proveedor: lo registra como pago (llamado desde el pago a proveedores, dentro de su transacción). */
export async function endosarChequeTx(tx: Tx, id: number, proveedorId: number, pagoId: number, actor: Actor) {
  const c = await cheque(tx, id);
  if (c.estado !== "en_cartera") throw new ErrorValidacion("Ese cheque ya no está en cartera.");
  const cartera = await cajaCartera(tx);
  const [p] = await tx.select().from(proveedores).where(eq(proveedores.id, proveedorId));
  await movimiento(tx, { cajaId: cartera.id, tipo: "pago_proveedor", importe: -c.importe, descripcion: `Endosado a ${p?.razonSocial}: ${titulo(c)}`, referencia: `pago:${pagoId}` }, actor);
  await tx.update(cheques).set({ estado: "endosado", proveedorId, pagoId }).where(eq(cheques.id, id));
  return c;
}

/** Cheque propio emitido para pagar a un proveedor (se debita del banco el día de pago). */
export async function emitirChequePropioTx(tx: Tx, d: { numero: string; bancoCajaId: number; importe: number; fechaPago: Date; proveedorId: number; pagoId: number }, actor: Actor) {
  const [banco] = await tx.select().from(cajas).where(eq(cajas.id, d.bancoCajaId));
  if (!banco || banco.tipo !== "banco" || banco.moneda !== "ARS") throw new ErrorValidacion("Elegí la cuenta bancaria de la chequera (en pesos).");
  validar({ numero: d.numero, banco: banco.nombre, importe: d.importe, fechaEmision: new Date(), fechaPago: d.fechaPago });
  const [ch] = await tx.insert(cheques).values({ tipo: "propio", numero: d.numero.trim(), banco: banco.nombre, importe: d.importe, fechaEmision: new Date(), fechaPago: d.fechaPago, estado: "emitido", proveedorId: d.proveedorId, bancoCajaId: banco.id, pagoId: d.pagoId, creadoEn: new Date(), usuarioId: actor.id }).returning({ id: cheques.id });
  return ch.id;
}

/** El banco debitó un cheque propio. */
export async function debitarCheque(id: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const c = await cheque(tx, id);
    if (c.tipo !== "propio" || c.estado !== "emitido") throw new ErrorValidacion("Solo se debitan cheques propios emitidos.");
    const [p] = c.proveedorId ? await tx.select().from(proveedores).where(eq(proveedores.id, c.proveedorId)) : [];
    await movimiento(tx, { cajaId: c.bancoCajaId!, tipo: "pago_proveedor", importe: -c.importe, descripcion: `Débito del cheque propio N.º ${c.numero}${p ? ` (${p.razonSocial})` : ""}`, referencia: `cheque:${c.id}` }, actor);
    await tx.update(cheques).set({ estado: "debitado" }).where(eq(cheques.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "cheque", entidadId: id, descripcion: `Se debitó el cheque propio N.º ${c.numero} por ${formatoMoneda(c.importe, "ARS")}` });
  });
}

/** Cheque de tercero rechazado: sale de donde esté y la deuda vuelve a quien lo entregó (cliente) o a quien lo recibió (proveedor). */
export async function rechazarCheque(id: number, motivo: string, actor: Actor) {
  if (motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo del rechazo.");
  await db.transaction(async (tx) => {
    const c = await cheque(tx, id);
    if (c.tipo !== "tercero" || !["en_cartera", "depositado", "endosado"].includes(c.estado)) throw new ErrorValidacion("Ese cheque no se puede rechazar.");
    const t = titulo(c);
    const ahora = new Date();
    if (c.estado === "en_cartera") {
      const cartera = await cajaCartera(tx);
      await movimiento(tx, { cajaId: cartera.id, tipo: "cheque", importe: -c.importe, descripcion: `Rechazado: ${t} (${motivo.trim()})`, referencia: `cheque:${c.id}` }, actor);
    }
    if (c.estado === "depositado") await movimiento(tx, { cajaId: c.bancoCajaId!, tipo: "cheque", importe: -c.importe, descripcion: `Rechazo del ${t} (${motivo.trim()})`, referencia: `cheque:${c.id}` }, actor);
    if (c.estado === "endosado" && c.proveedorId)
      await tx.insert(movimientosCcProveedores).values({ proveedorId: c.proveedorId, fecha: ahora, tipo: "ajuste", moneda: "ARS", importe: c.importe, descripcion: `Nos devolvió el ${t} rechazado: se le vuelve a deber`, usuarioId: actor.id });
    if (c.clienteId) await tx.insert(movimientosCcClientes).values({ clienteId: c.clienteId, fecha: ahora, tipo: "ajuste", importe: c.importe, descripcion: `${t} rechazado (${motivo.trim()})`, documento: `cheque:${c.id}`, usuarioId: actor.id });
    await tx.update(cheques).set({ estado: "rechazado", notas: [c.notas, `Rechazado: ${motivo.trim()}`].filter(Boolean).join(" · ") }).where(eq(cheques.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "cheque", entidadId: id, descripcion: `Rechazo del ${t} por ${formatoMoneda(c.importe, "ARS")} (${motivo.trim()})${c.clienteId ? ": vuelve a la deuda del cliente" : ""}` });
  });
}

/** Al anular un pago a proveedor: el cheque endosado vuelve a la cartera; el propio sin debitar se anula. */
export async function revertirChequesDePago(tx: Tx, pagoId: number) {
  const cs = await tx.select().from(cheques).where(eq(cheques.pagoId, pagoId));
  for (const c of cs) {
    if (c.tipo === "propio") {
      if (c.estado === "debitado") throw new ErrorValidacion(`El cheque propio N.º ${c.numero} ya se debitó del banco: no se puede anular el pago.`);
      await tx.update(cheques).set({ estado: "anulado" }).where(eq(cheques.id, c.id));
    } else if (c.estado === "endosado") await tx.update(cheques).set({ estado: "en_cartera", proveedorId: null, pagoId: null }).where(eq(cheques.id, c.id));
    else throw new ErrorValidacion(`El cheque N.º ${c.numero} ya fue rechazado: no se puede anular el pago.`);
  }
}

export async function listarCheques(f: { tipo?: "tercero" | "propio"; estados?: string[] } = {}) {
  return db
    .select({ c: cheques, cliente: clientes.nombre, proveedor: proveedores.razonSocial })
    .from(cheques)
    .leftJoin(clientes, eq(clientes.id, cheques.clienteId))
    .leftJoin(proveedores, eq(proveedores.id, cheques.proveedorId))
    .where(and(f.tipo ? eq(cheques.tipo, f.tipo) : undefined, f.estados?.length ? inArray(cheques.estado, f.estados) : undefined))
    .orderBy(asc(cheques.fechaPago), desc(cheques.id))
    .limit(500);
}

/** Cheques que vencen (pagan) hasta la fecha: en cartera (para depositar) y propios (para tener fondos). */
export async function chequesProximos(hasta: Date) {
  return db.select().from(cheques).where(and(inArray(cheques.estado, ["en_cartera", "emitido"]), lte(cheques.fechaPago, hasta))).orderBy(asc(cheques.fechaPago));
}

void like;
void sql;
void movimientosCaja;

/**
 * Tesorería: cajas y cuentas, su libro de movimientos, gastos e ingresos varios, transferencias y compra/venta de
 * divisas. Cada caja tiene una moneda; el saldo es la suma de sus movimientos no anulados. Nada se borra: un
 * movimiento cargado a mano se anula y queda en la auditoría.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { cajas, categoriasTesoreria, db, mediosPago, movimientosCaja, type Tx } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { aMicro } from "../cotizaciones/tipos";
import { leerUna } from "../config";
import { obtenerVigentes } from "../cotizaciones/vigentes";

export const TIPOS_CAJA = { efectivo: "Efectivo", banco: "Banco", billetera: "Billetera virtual / QR", tarjetas: "Tarjetas a acreditar", cheques: "Cheques en cartera" } as const;
export type TipoCaja = keyof typeof TIPOS_CAJA;
export const TIPOS_MOVIMIENTO: Record<string, string> = {
  saldo_inicial: "Saldo inicial",
  cobro: "Cobro",
  pago_proveedor: "Pago a proveedor",
  gasto: "Gasto",
  ingreso: "Ingreso",
  transferencia: "Transferencia",
  cambio: "Compra/venta de divisas",
  arqueo: "Diferencia de arqueo",
  acreditacion: "Acreditación de tarjetas",
  cheque: "Cheque",
  reintegro: "Reintegro a cliente",
};
const MONEDAS = ["ARS", "USD", "EUR"] as const;

/** Cajas con que arranca el sistema (la dueña las renombra, agrega o desactiva). */
export const CAJAS_INICIALES: { nombre: string; tipo: TipoCaja; moneda?: string; arqueo?: boolean; dias?: number }[] = [
  { nombre: "Caja efectivo pesos", tipo: "efectivo", arqueo: true },
  { nombre: "Caja efectivo dólares", tipo: "efectivo", moneda: "USD", arqueo: true },
  { nombre: "Caja efectivo euros", tipo: "efectivo", moneda: "EUR", arqueo: true },
  { nombre: "Banco (cuenta corriente)", tipo: "banco" },
  { nombre: "Banco (cuenta en dólares)", tipo: "banco", moneda: "USD" },
  { nombre: "Mercado Pago", tipo: "billetera" },
  { nombre: "Tarjetas a acreditar", tipo: "tarjetas", dias: 10 },
  { nombre: "Cheques en cartera", tipo: "cheques" },
];
export const CATEGORIAS_INICIALES: [string, "gasto" | "ingreso"][] = [
  ["Alquiler", "gasto"],
  ["Sueldos y cargas sociales", "gasto"],
  ["Servicios (luz, gas, internet, teléfono)", "gasto"],
  ["Impuestos y tasas", "gasto"],
  ["Retenciones de tarjetas", "gasto"],
  ["Comisiones bancarias y de tarjetas", "gasto"],
  ["Publicidad", "gasto"],
  ["Seguros", "gasto"],
  ["Packaging", "gasto"],
  ["Mantenimiento y limpieza", "gasto"],
  ["Retiros de los dueños", "gasto"],
  ["Otros gastos", "gasto"],
  ["Ingresos varios", "ingreso"],
  ["Aportes de los dueños", "ingreso"],
  ["Intereses", "ingreso"],
];

/** Crea las cajas iniciales y vincula los medios de cobro con su caja (solo si todavía no hay cajas). */
export async function cargarCajasIniciales() {
  if ((await db.select({ id: cajas.id }).from(cajas)).length) return 0;
  const ids: Record<string, number> = {};
  for (const [i, c] of CAJAS_INICIALES.entries()) {
    const [x] = await db.insert(cajas).values({ nombre: c.nombre, tipo: c.tipo, moneda: c.moneda ?? "ARS", arqueo: c.arqueo ?? false, diasAcreditacion: c.dias ?? 0, orden: i }).returning({ id: cajas.id });
    ids[`${c.tipo}:${c.moneda ?? "ARS"}`] = x.id;
  }
  await db.update(cajas).set({ bancoId: ids["banco:ARS"] }).where(eq(cajas.tipo, "tarjetas"));
  for (const [i, [nombre, tipo]] of CATEGORIAS_INICIALES.entries()) await db.insert(categoriasTesoreria).values({ nombre, tipo, orden: i });
  const medios = await db.select().from(mediosPago);
  for (const m of medios) {
    const clave = m.tipo === "efectivo" ? `efectivo:${m.moneda}` : m.tipo === "transferencia" ? "banco:ARS" : m.tipo === "qr" ? "billetera:ARS" : ["debito", "credito"].includes(m.tipo) ? "tarjetas:ARS" : null;
    if (clave && ids[clave] && !m.cajaId) await db.update(mediosPago).set({ cajaId: ids[clave] }).where(eq(mediosPago.id, m.id));
  }
  return CAJAS_INICIALES.length;
}

export async function guardarCaja(
  id: number | null,
  d: { nombre: string; tipo: string; moneda: string; arqueo: boolean; diasAcreditacion: number; comisionPct: number; retencionPct: number; bancoId: number | null; activa: boolean; orden: number },
  actor: Actor,
) {
  const r = z
    .object({
      nombre: z.string().trim().min(2, "Escribí el nombre de la caja.").max(60),
      tipo: z.enum(Object.keys(TIPOS_CAJA) as [TipoCaja]),
      moneda: z.enum(MONEDAS),
      arqueo: z.boolean(),
      diasAcreditacion: z.number().int().min(0).max(120),
      comisionPct: z.number().int().min(0).max(5000),
      retencionPct: z.number().int().min(0).max(5000),
      bancoId: z.number().int().positive().nullable(),
      activa: z.boolean(),
      orden: z.number().int(),
    })
    .safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  await db.transaction(async (tx) => {
    const [otra] = await tx.select().from(cajas).where(eq(cajas.nombre, r.data.nombre));
    if (otra && otra.id !== id) throw new ErrorValidacion(`Ya existe la caja «${r.data.nombre}».`);
    if (id) {
      const [antes] = await tx.select().from(cajas).where(eq(cajas.id, id));
      if (!antes) throw new ErrorValidacion("La caja no existe.");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(movimientosCaja).where(eq(movimientosCaja.cajaId, id));
      if (n && antes.moneda !== r.data.moneda) throw new ErrorValidacion("La caja ya tiene movimientos: no se puede cambiar su moneda (creá otra).");
      await tx.update(cajas).set(r.data).where(eq(cajas.id, id));
      await auditar(tx, actor, { accion: "modificacion", entidad: "caja", entidadId: id, descripcion: `Modificó la caja «${r.data.nombre}»${r.data.activa ? "" : " (desactivada)"}` });
    } else {
      const [x] = await tx.insert(cajas).values(r.data).returning({ id: cajas.id });
      await auditar(tx, actor, { accion: "alta", entidad: "caja", entidadId: x.id, descripcion: `Creó la caja «${r.data.nombre}» (${TIPOS_CAJA[r.data.tipo]}, ${r.data.moneda})` });
    }
  });
}

export async function obtenerCaja(id: number, tx: Tx = db) {
  const [c] = await tx.select().from(cajas).where(eq(cajas.id, id));
  return c ?? null;
}

export async function saldoCaja(cajaId: number, tx: Tx = db, hasta?: Date) {
  const [{ s }] = await tx
    .select({ s: sql<number>`coalesce(sum(${movimientosCaja.importe}), 0)` })
    .from(movimientosCaja)
    .where(and(eq(movimientosCaja.cajaId, cajaId), eq(movimientosCaja.anulado, false), hasta ? lte(movimientosCaja.fecha, hasta) : undefined));
  return s;
}

/** Pesos por unidad de cada moneda para mostrar equivalentes (cotización de COMPRA del dólar de referencia / euro). */
export async function cambiosDelDia() {
  const v = await obtenerVigentes();
  const ref = await leerUna("cotizaciones.dolar_referencia");
  return { ARS: 1, USD: v[ref].compra ?? v[ref].venta ?? null, EUR: v.EUR_OFICIAL.compra ?? v.EUR_OFICIAL.venta ?? null } as Record<string, number | null>;
}

export async function listarCajas(soloActivas = true) {
  const filas = await db.select().from(cajas).where(soloActivas ? eq(cajas.activa, true) : undefined).orderBy(asc(cajas.orden), asc(cajas.id));
  const saldos = await db
    .select({ id: movimientosCaja.cajaId, s: sql<number>`sum(${movimientosCaja.importe})` })
    .from(movimientosCaja)
    .where(eq(movimientosCaja.anulado, false))
    .groupBy(movimientosCaja.cajaId);
  const tc = await cambiosDelDia();
  return filas.map((c) => {
    const saldo = saldos.find((x) => x.id === c.id)?.s ?? 0;
    const cambio = tc[c.moneda];
    return { ...c, saldo, enPesos: cambio == null ? null : Math.round(saldo * cambio) };
  });
}
export type CajaConSaldo = Awaited<ReturnType<typeof listarCajas>>[number];

/** Movimiento en una caja (dentro de la transacción de la operación). Valida que la caja exista y esté activa. */
export async function movimiento(
  tx: Tx,
  m: { cajaId: number; tipo: string; importe: number; descripcion: string; referencia?: string | null; categoriaId?: number | null; grupo?: string | null; tipoCambio?: number | null; fecha?: Date; moneda?: string },
  actor: Actor,
) {
  if (!Number.isInteger(m.importe) || m.importe === 0) throw new ErrorValidacion("Indicá el importe.");
  const c = await obtenerCaja(m.cajaId, tx);
  if (!c || !c.activa) throw new ErrorValidacion("Elegí una caja activa.");
  if (m.moneda && m.moneda !== c.moneda) throw new ErrorValidacion(`La caja «${c.nombre}» es en ${c.moneda}: elegí una caja en ${m.moneda}.`);
  const [x] = await tx
    .insert(movimientosCaja)
    .values({ cajaId: m.cajaId, fecha: m.fecha ?? new Date(), tipo: m.tipo, importe: m.importe, descripcion: m.descripcion, referencia: m.referencia ?? null, categoriaId: m.categoriaId ?? null, grupo: m.grupo ?? null, tipoCambio: m.tipoCambio ?? null, usuarioId: actor.id })
    .returning({ id: movimientosCaja.id });
  return { id: x.id, caja: c };
}

/** Anula los movimientos de caja que nacieron de una operación (por ejemplo, al anular una venta o un pago). */
export async function anularMovimientosDe(tx: Tx, referencias: string[]) {
  if (!referencias.length) return;
  await tx.update(movimientosCaja).set({ anulado: true }).where(and(inArray(movimientosCaja.referencia, referencias), eq(movimientosCaja.anulado, false)));
}

const fmt = (c: number, moneda: string) => `${moneda === "ARS" ? "$" : moneda === "USD" ? "US$" : "€"} ${(c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export { fmt as formatoMoneda };

/** Gasto (egreso) o ingreso vario con su categoría. */
export async function registrarGastoIngreso(d: { tipo: "gasto" | "ingreso"; cajaId: number; categoriaId: number; importe: number; descripcion: string; fecha?: Date }, actor: Actor) {
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new ErrorValidacion("Indicá el importe.");
  if (d.descripcion.trim().length < 3) throw new ErrorValidacion("Escribí el detalle.");
  return db.transaction(async (tx) => {
    const [cat] = await tx.select().from(categoriasTesoreria).where(eq(categoriasTesoreria.id, d.categoriaId));
    if (!cat || cat.tipo !== d.tipo) throw new ErrorValidacion("Elegí la categoría.");
    const { id, caja } = await movimiento(tx, { cajaId: d.cajaId, tipo: d.tipo, importe: d.tipo === "gasto" ? -d.importe : d.importe, descripcion: d.descripcion.trim(), categoriaId: cat.id, fecha: d.fecha }, actor);
    if (d.tipo === "gasto" && caja.tipo !== "tarjetas" && caja.tipo !== "cheques") await controlarNegativo(tx, caja.id, caja.nombre);
    await auditar(tx, actor, { accion: "alta", entidad: "movimiento_caja", entidadId: id, descripcion: `${d.tipo === "gasto" ? "Gasto" : "Ingreso"} en «${caja.nombre}»: ${fmt(d.importe, caja.moneda)} · ${cat.nombre} · ${d.descripcion.trim()}` });
    return id;
  });
}

/** El efectivo no puede quedar en negativo (avisa que falta registrar algo). */
async function controlarNegativo(tx: Tx, cajaId: number, nombre: string) {
  const c = await obtenerCaja(cajaId, tx);
  if (c?.tipo !== "efectivo") return;
  const s = await saldoCaja(cajaId, tx);
  if (s < 0) throw new ErrorValidacion(`En «${nombre}» no alcanza el efectivo (quedaría en ${fmt(s, c.moneda)}). Revisá si falta registrar algún ingreso.`);
}

/** Transferencia entre cajas de la misma moneda. */
export async function transferir(d: { origenId: number; destinoId: number; importe: number; detalle?: string }, actor: Actor) {
  if (d.origenId === d.destinoId) throw new ErrorValidacion("Elegí dos cajas distintas.");
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new ErrorValidacion("Indicá el importe.");
  return db.transaction(async (tx) => {
    const o = await obtenerCaja(d.origenId, tx);
    const dest = await obtenerCaja(d.destinoId, tx);
    if (!o || !dest) throw new ErrorValidacion("Elegí las cajas.");
    if (o.moneda !== dest.moneda) throw new ErrorValidacion("Las cajas tienen distinta moneda: usá «Compra o venta de divisas».");
    const grupo = randomUUID();
    const det = d.detalle?.trim() ? ` (${d.detalle.trim()})` : "";
    await movimiento(tx, { cajaId: o.id, tipo: "transferencia", importe: -d.importe, descripcion: `Transferencia a «${dest.nombre}»${det}`, grupo }, actor);
    await movimiento(tx, { cajaId: dest.id, tipo: "transferencia", importe: d.importe, descripcion: `Transferencia desde «${o.nombre}»${det}`, grupo }, actor);
    await controlarNegativo(tx, o.id, o.nombre);
    await auditar(tx, actor, { accion: "alta", entidad: "movimiento_caja", descripcion: `Transfirió ${fmt(d.importe, o.moneda)} de «${o.nombre}» a «${dest.nombre}»${det}` });
    return grupo;
  });
}

/** Compra o venta de divisas entre cajas: sale un importe en una moneda y entra otro en la otra, con el cambio de la operación. */
export async function cambiarDivisas(d: { origenId: number; destinoId: number; importeOrigen: number; importeDestino: number; detalle?: string }, actor: Actor) {
  if (d.origenId === d.destinoId) throw new ErrorValidacion("Elegí dos cajas distintas.");
  if (!Number.isInteger(d.importeOrigen) || d.importeOrigen <= 0 || !Number.isInteger(d.importeDestino) || d.importeDestino <= 0) throw new ErrorValidacion("Indicá los dos importes.");
  return db.transaction(async (tx) => {
    const o = await obtenerCaja(d.origenId, tx);
    const dest = await obtenerCaja(d.destinoId, tx);
    if (!o || !dest) throw new ErrorValidacion("Elegí las cajas.");
    if (o.moneda === dest.moneda) throw new ErrorValidacion("Las dos cajas son de la misma moneda: usá «Transferencia».");
    if (o.moneda !== "ARS" && dest.moneda !== "ARS") throw new ErrorValidacion("Una de las dos cajas tiene que ser en pesos.");
    // Cambio = pesos por unidad de divisa.
    const pesos = o.moneda === "ARS" ? d.importeOrigen : d.importeDestino;
    const divisa = o.moneda === "ARS" ? d.importeDestino : d.importeOrigen;
    const tc = pesos / divisa;
    const grupo = randomUUID();
    const operacion = o.moneda === "ARS" ? `Compra de ${dest.moneda}` : `Venta de ${o.moneda}`;
    const det = `${operacion} a ${tc.toLocaleString("es-AR", { maximumFractionDigits: 2 })}${d.detalle?.trim() ? ` (${d.detalle.trim()})` : ""}`;
    await movimiento(tx, { cajaId: o.id, tipo: "cambio", importe: -d.importeOrigen, descripcion: det, grupo, tipoCambio: aMicro(tc) }, actor);
    await movimiento(tx, { cajaId: dest.id, tipo: "cambio", importe: d.importeDestino, descripcion: det, grupo, tipoCambio: aMicro(tc) }, actor);
    await controlarNegativo(tx, o.id, o.nombre);
    await auditar(tx, actor, { accion: "alta", entidad: "movimiento_caja", descripcion: `${det}: salieron ${fmt(d.importeOrigen, o.moneda)} de «${o.nombre}» y entraron ${fmt(d.importeDestino, dest.moneda)} a «${dest.nombre}»` });
    return { grupo, tc };
  });
}

/** Saldo inicial de una caja (cuando se empieza a usar el sistema). Solo una vez por caja. */
export async function saldoInicial(cajaId: number, importe: number, actor: Actor) {
  if (!Number.isInteger(importe) || importe === 0) throw new ErrorValidacion("Indicá el importe.");
  await db.transaction(async (tx) => {
    const [ya] = await tx.select().from(movimientosCaja).where(and(eq(movimientosCaja.cajaId, cajaId), eq(movimientosCaja.tipo, "saldo_inicial"), eq(movimientosCaja.anulado, false)));
    if (ya) throw new ErrorValidacion("Esta caja ya tiene saldo inicial: para corregirlo anulalo y cargalo de nuevo.");
    const { caja } = await movimiento(tx, { cajaId, tipo: "saldo_inicial", importe, descripcion: "Saldo inicial" }, actor);
    await auditar(tx, actor, { accion: "alta", entidad: "movimiento_caja", descripcion: `Saldo inicial de «${caja.nombre}»: ${fmt(importe, caja.moneda)}` });
  });
}

/** Anula un movimiento cargado a mano (gasto, ingreso, saldo inicial, transferencia o cambio: con su contraparte). */
export async function anularMovimiento(id: number, motivo: string, actor: Actor) {
  if (motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo de la anulación.");
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(movimientosCaja).where(eq(movimientosCaja.id, id));
    if (!m || m.anulado) throw new ErrorValidacion("El movimiento no existe o ya está anulado.");
    if (!["gasto", "ingreso", "saldo_inicial", "transferencia", "cambio"].includes(m.tipo)) throw new ErrorValidacion("Este movimiento viene de otra operación (venta, pago, cheque…): se anula desde ahí.");
    if (m.conciliado) throw new ErrorValidacion("El movimiento ya está conciliado con el banco.");
    const ids = m.grupo ? (await tx.select({ id: movimientosCaja.id }).from(movimientosCaja).where(eq(movimientosCaja.grupo, m.grupo))).map((x) => x.id) : [id];
    await tx.update(movimientosCaja).set({ anulado: true }).where(inArray(movimientosCaja.id, ids));
    await auditar(tx, actor, { accion: "anulacion", entidad: "movimiento_caja", entidadId: id, descripcion: `Anuló «${m.descripcion}» (${motivo.trim()})` });
  });
}

export type FiltroMovimientos = { cajaId?: number; desde?: Date; hasta?: Date; tipo?: string; categoriaId?: number; texto?: string; anulados?: boolean; limite?: number };

export async function listarMovimientos(f: FiltroMovimientos) {
  const c: SQL[] = [];
  if (f.cajaId) c.push(eq(movimientosCaja.cajaId, f.cajaId));
  if (f.desde) c.push(gte(movimientosCaja.fecha, f.desde));
  if (f.hasta) c.push(lte(movimientosCaja.fecha, f.hasta));
  if (f.tipo) c.push(eq(movimientosCaja.tipo, f.tipo));
  if (f.categoriaId) c.push(eq(movimientosCaja.categoriaId, f.categoriaId));
  if (!f.anulados) c.push(eq(movimientosCaja.anulado, false));
  if (f.texto?.trim()) c.push(sql`${movimientosCaja.descripcion} like ${`%${f.texto.trim().replace(/[%_]/g, "")}%`}`);
  return db
    .select({ m: movimientosCaja, caja: cajas.nombre, moneda: cajas.moneda, categoria: categoriasTesoreria.nombre })
    .from(movimientosCaja)
    .innerJoin(cajas, eq(cajas.id, movimientosCaja.cajaId))
    .leftJoin(categoriasTesoreria, eq(categoriasTesoreria.id, movimientosCaja.categoriaId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(desc(movimientosCaja.fecha), desc(movimientosCaja.id))
    .limit(f.limite ?? 500);
}

export const listarCategorias = (tipo?: "gasto" | "ingreso") =>
  db.select().from(categoriasTesoreria).where(tipo ? eq(categoriasTesoreria.tipo, tipo) : undefined).orderBy(asc(categoriasTesoreria.orden), asc(categoriasTesoreria.id));

export async function guardarCategoria(id: number | null, d: { nombre: string; tipo: "gasto" | "ingreso"; activa: boolean }, actor: Actor) {
  if (d.nombre.trim().length < 2) throw new ErrorValidacion("Escribí el nombre.");
  await db.transaction(async (tx) => {
    if (id) await tx.update(categoriasTesoreria).set({ nombre: d.nombre.trim(), activa: d.activa }).where(eq(categoriasTesoreria.id, id));
    else await tx.insert(categoriasTesoreria).values({ nombre: d.nombre.trim(), tipo: d.tipo, orden: 99 });
    await auditar(tx, actor, { accion: id ? "modificacion" : "alta", entidad: "caja", descripcion: `Categoría de ${d.tipo === "gasto" ? "gastos" : "ingresos"} «${d.nombre.trim()}»${d.activa ? "" : " (desactivada)"}` });
  });
}

/** Gastos e ingresos por categoría en un período (en pesos; las divisas a la cotización de la operación o del día). */
export async function resumenPorCategoria(desde: Date, hasta: Date) {
  const filas = await db
    .select({ categoria: categoriasTesoreria.nombre, tipo: categoriasTesoreria.tipo, moneda: cajas.moneda, total: sql<number>`sum(${movimientosCaja.importe})` })
    .from(movimientosCaja)
    .innerJoin(cajas, eq(cajas.id, movimientosCaja.cajaId))
    .innerJoin(categoriasTesoreria, eq(categoriasTesoreria.id, movimientosCaja.categoriaId))
    .where(and(eq(movimientosCaja.anulado, false), gte(movimientosCaja.fecha, desde), lte(movimientosCaja.fecha, hasta)))
    .groupBy(categoriasTesoreria.id, cajas.moneda);
  return filas;
}

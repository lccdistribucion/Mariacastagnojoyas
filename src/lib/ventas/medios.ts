/** Medios de cobro y planes de cuotas (configurables). */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { cajas, db, mediosPago, planesCuotas } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";

export const TIPOS_MEDIO = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  qr: "QR / billetera",
  debito: "Tarjeta de débito",
  credito: "Tarjeta de crédito",
  cuenta_corriente: "Cuenta corriente",
  vale: "Gift card / vale",
  saldo_favor: "Saldo a favor del cliente",
  otro: "Otro",
} as const;
export type TipoMedio = keyof typeof TIPOS_MEDIO;

/** Los medios arrancan sin recargos ni descuentos: los define la dueña. */
export const MEDIOS_INICIALES: { nombre: string; tipo: TipoMedio; moneda?: string; cuotas?: number[] }[] = [
  { nombre: "Efectivo", tipo: "efectivo" },
  { nombre: "Efectivo en dólares", tipo: "efectivo", moneda: "USD" },
  { nombre: "Efectivo en euros", tipo: "efectivo", moneda: "EUR" },
  { nombre: "Transferencia", tipo: "transferencia" },
  { nombre: "QR / Mercado Pago", tipo: "qr" },
  { nombre: "Tarjeta de débito", tipo: "debito" },
  { nombre: "Tarjeta de crédito", tipo: "credito", cuotas: [1, 3, 6, 12] },
  { nombre: "Cuenta corriente", tipo: "cuenta_corriente" },
  { nombre: "Gift card / vale", tipo: "vale" },
  { nombre: "Saldo a favor / seña", tipo: "saldo_favor" },
];

export async function cargarMediosIniciales() {
  if ((await db.select({ id: mediosPago.id }).from(mediosPago)).length) return;
  for (const [i, m] of MEDIOS_INICIALES.entries()) {
    const [x] = await db.insert(mediosPago).values({ nombre: m.nombre, tipo: m.tipo, moneda: m.moneda ?? "ARS", orden: i }).returning({ id: mediosPago.id });
    for (const c of m.cuotas ?? []) await db.insert(planesCuotas).values({ medioId: x.id, cuotas: c });
  }
}

export async function listarMedios(soloActivos = true) {
  const [m, p] = await Promise.all([db.select().from(mediosPago).orderBy(asc(mediosPago.orden), asc(mediosPago.id)), db.select().from(planesCuotas).orderBy(asc(planesCuotas.cuotas))]);
  return m.filter((x) => !soloActivos || x.activo).map((x) => ({ ...x, planes: p.filter((y) => y.medioId === x.id && (!soloActivos || y.activo)) }));
}
export type Medio = Awaited<ReturnType<typeof listarMedios>>[number];

export async function guardarMedio(id: number | null, d: { nombre: string; tipo: string; moneda: string; ajustePct: number; activo: boolean; orden: number; cajaId?: number | null }, actor: Actor) {
  const r = z
    .object({ nombre: z.string().trim().min(2).max(40), tipo: z.enum(Object.keys(TIPOS_MEDIO) as [TipoMedio]), moneda: z.enum(["ARS", "USD", "EUR"]), ajustePct: z.number().int().min(-5000).max(20000), activo: z.boolean(), orden: z.number().int(), cajaId: z.number().int().positive().nullable().optional() })
    .safeParse(d);
  if (!r.success) throw new ErrorValidacion("Revisá los datos del medio de cobro.");
  await db.transaction(async (tx) => {
    if (r.data.cajaId) {
      const [c] = await tx.select().from(cajas).where(eq(cajas.id, r.data.cajaId));
      if (!c) throw new ErrorValidacion("La caja no existe.");
      if (c.moneda !== r.data.moneda) throw new ErrorValidacion(`«${r.data.nombre}» cobra en ${r.data.moneda} y la caja «${c.nombre}» es en ${c.moneda}.`);
      if (["cuenta_corriente", "saldo_favor", "vale"].includes(r.data.tipo)) throw new ErrorValidacion("Cuenta corriente, saldo a favor y vales no mueven caja: dejalos sin caja.");
    }
    const [otro] = await tx.select().from(mediosPago).where(eq(mediosPago.nombre, r.data.nombre));
    if (otro && otro.id !== id) throw new ErrorValidacion(`Ya existe «${r.data.nombre}».`);
    const ver = (x: { nombre: string; ajustePct: number; activo: boolean }) => ({ Nombre: x.nombre, "Recargo / descuento": `${x.ajustePct / 100} %`, Activo: x.activo ? "Sí" : "No" });
    if (id) {
      const [antes] = await tx.select().from(mediosPago).where(eq(mediosPago.id, id));
      await tx.update(mediosPago).set(r.data).where(eq(mediosPago.id, id));
      await auditar(tx, actor, { accion: "modificacion", entidad: "medio_pago", entidadId: id, descripcion: `Modificó el medio de cobro «${r.data.nombre}»`, antes: antes && ver(antes), despues: ver(r.data) });
    } else {
      const [n] = await tx.insert(mediosPago).values(r.data).returning({ id: mediosPago.id });
      await auditar(tx, actor, { accion: "alta", entidad: "medio_pago", entidadId: n.id, descripcion: `Agregó el medio de cobro «${r.data.nombre}»`, despues: ver(r.data) });
    }
  });
}

export async function guardarPlan(id: number | null, d: { medioId: number; cuotas: number; recargoPct: number; activo: boolean }, actor: Actor) {
  if (!Number.isInteger(d.cuotas) || d.cuotas < 1 || d.cuotas > 48) throw new ErrorValidacion("Cantidad de cuotas no válida.");
  if (!Number.isInteger(d.recargoPct) || d.recargoPct < -5000 || d.recargoPct > 30000) throw new ErrorValidacion("Recargo no válido.");
  await db.transaction(async (tx) => {
    if (id) await tx.update(planesCuotas).set({ cuotas: d.cuotas, recargoPct: d.recargoPct, activo: d.activo }).where(eq(planesCuotas.id, id));
    else await tx.insert(planesCuotas).values(d);
    await auditar(tx, actor, { accion: id ? "modificacion" : "alta", entidad: "medio_pago", entidadId: d.medioId, descripcion: `Plan de ${d.cuotas} cuota/s: recargo ${d.recargoPct / 100} %${d.activo ? "" : " (inactivo)"}` });
  });
}

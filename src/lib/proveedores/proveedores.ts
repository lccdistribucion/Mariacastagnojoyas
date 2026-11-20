/**
 * Proveedores, artesanos y terceros (revendedores). Alta y edición con CUIT validado y sin duplicados;
 * cuenta corriente por moneda. Nada se borra: se desactiva. Todo queda en auditoría.
 */
import { and, asc, desc, eq, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { compras, db, movimientosCcProveedores, productos, proveedores } from "@/db";
import { auditar, diferencias, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { CONDICIONES_IVA, cuitValido, normalizarWhatsapp, soloDigitos } from "../identidad";

import { RUBROS, type Rubro } from "./rubros";
export { RUBROS, type Rubro };

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const esquemaProveedor = z
  .object({
    razonSocial: z.string().trim().min(2, "Escribí la razón social o el nombre.").max(120),
    nombreFantasia: texto(120),
    cuit: texto(20),
    condicionIva: z.enum(Object.keys(CONDICIONES_IVA) as [keyof typeof CONDICIONES_IVA]),
    rubros: z.array(z.enum(Object.keys(RUBROS) as [Rubro])).min(1, "Elegí al menos un rubro."),
    contacto: texto(80),
    telefono: texto(40),
    whatsapp: texto(40),
    email: texto(120),
    domicilio: texto(150),
    condicionesPago: texto(200),
    diasPago: z.number().int().min(0).max(365),
    notas: texto(1000),
  })
  .transform((d) => ({ ...d, cuit: d.cuit ? soloDigitos(d.cuit) : null, whatsappOriginal: d.whatsapp, whatsapp: d.whatsapp ? normalizarWhatsapp(d.whatsapp) : null }))
  .refine((d) => !d.cuit || cuitValido(d.cuit), { message: "El CUIT no es válido (revisá los números)." })
  .refine((d) => !d.whatsappOriginal || d.whatsapp, { message: "El WhatsApp no parece un celular válido." });
export type DatosProveedor = z.input<typeof esquemaProveedor>;

function validar(d: DatosProveedor) {
  const r = esquemaProveedor.safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const { whatsappOriginal: _w, rubros, ...v } = r.data;
  void _w;
  return { ...v, rubros: JSON.stringify(rubros) };
}

const foto = (p: Record<string, unknown>) => ({
  "Razón social": p.razonSocial,
  "Nombre de fantasía": p.nombreFantasia ?? "—",
  CUIT: p.cuit ?? "—",
  "Condición IVA": CONDICIONES_IVA[p.condicionIva as keyof typeof CONDICIONES_IVA],
  Rubros: (JSON.parse(String(p.rubros ?? "[]")) as Rubro[]).map((r) => RUBROS[r]).join(", "),
  Contacto: p.contacto ?? "—",
  Teléfono: p.telefono ?? "—",
  WhatsApp: p.whatsapp ?? "—",
  Email: p.email ?? "—",
  Domicilio: p.domicilio ?? "—",
  "Condiciones de pago": p.condicionesPago ?? "—",
  "Días de pago": p.diasPago,
});

export async function crearProveedor(datos: DatosProveedor, actor: Actor, esDemo = false) {
  const d = validar(datos);
  return db.transaction(async (tx) => {
    if (d.cuit) {
      const [otro] = await tx.select().from(proveedores).where(eq(proveedores.cuit, d.cuit));
      if (otro) throw new ErrorValidacion(`Ya existe un proveedor con ese CUIT: ${otro.razonSocial}.`);
    }
    const [mismo] = await tx.select().from(proveedores).where(sql`lower(${proveedores.razonSocial}) = ${d.razonSocial.toLowerCase()}`);
    if (mismo) throw new ErrorValidacion(`Ya existe el proveedor «${mismo.razonSocial}».`);
    const [p] = await tx.insert(proveedores).values({ ...d, esDemo }).returning({ id: proveedores.id });
    await auditar(tx, actor, { accion: "alta", entidad: "proveedor", entidadId: p.id, descripcion: `Dio de alta al proveedor ${d.razonSocial}`, despues: foto(d) });
    return p.id;
  });
}

export async function editarProveedor(id: number, datos: DatosProveedor, actor: Actor) {
  const d = validar(datos);
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(proveedores).where(eq(proveedores.id, id));
    if (!antes) throw new ErrorValidacion("El proveedor no existe.");
    if (d.cuit) {
      const [otro] = await tx.select().from(proveedores).where(and(eq(proveedores.cuit, d.cuit), ne(proveedores.id, id)));
      if (otro) throw new ErrorValidacion(`Ese CUIT ya es de ${otro.razonSocial}.`);
    }
    const dif = diferencias(foto(antes), foto(d));
    if (!dif.hayCambios) return;
    await tx.update(proveedores).set(d).where(eq(proveedores.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "proveedor", entidadId: id, descripcion: `Modificó al proveedor ${d.razonSocial}`, antes: dif.antes, despues: dif.despues });
  });
}

export async function cambiarEstadoProveedor(id: number, activo: boolean, actor: Actor) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(proveedores).where(eq(proveedores.id, id));
    if (!p || p.activo === activo) return;
    await tx.update(proveedores).set({ activo }).where(eq(proveedores.id, id));
    await auditar(tx, actor, { accion: activo ? "reactivacion" : "desactivacion", entidad: "proveedor", entidadId: id, descripcion: `${activo ? "Reactivó" : "Desactivó"} al proveedor ${p.razonSocial}` });
  });
}

/** Saldo de cuenta corriente por moneda ({ARS: 120000, USD: -500}). Positivo: le debemos. */
export async function saldos(proveedorIds?: number[]) {
  const filas = await db
    .select({ id: movimientosCcProveedores.proveedorId, moneda: movimientosCcProveedores.moneda, saldo: sql<number>`sum(${movimientosCcProveedores.importe})` })
    .from(movimientosCcProveedores)
    .where(and(eq(movimientosCcProveedores.anulado, false), proveedorIds?.length ? inArray(movimientosCcProveedores.proveedorId, proveedorIds) : undefined))
    .groupBy(movimientosCcProveedores.proveedorId, movimientosCcProveedores.moneda);
  const out = new Map<number, Record<string, number>>();
  for (const f of filas) {
    if (!f.saldo) continue;
    out.set(f.id, { ...(out.get(f.id) ?? {}), [f.moneda]: f.saldo });
  }
  return out;
}

export async function listarProveedores(f: { q?: string; rubro?: string; inactivos?: boolean; conSaldo?: boolean }) {
  const c: SQL[] = [];
  if (!f.inactivos) c.push(eq(proveedores.activo, true));
  if (f.q?.trim()) {
    const t = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    const dig = soloDigitos(f.q);
    c.push(or(like(proveedores.razonSocial, t), like(proveedores.nombreFantasia, t), like(proveedores.contacto, t), ...(dig.length >= 3 ? [like(proveedores.cuit, `%${dig}%`)] : []))!);
  }
  if (f.rubro) c.push(like(proveedores.rubros, `%"${f.rubro.replace(/[^a-z]/g, "")}"%`));
  const filas = await db.select().from(proveedores).where(c.length ? and(...c) : undefined).orderBy(asc(proveedores.razonSocial));
  const s = await saldos(filas.map((x) => x.id));
  const conteo = await db
    .select({ id: productos.proveedorId, consignadas: sql<number>`sum(case when ${productos.origen} = 'consignacion' and ${productos.estado} not in ('vendido','baja','devuelto') then 1 else 0 end)` })
    .from(productos)
    .groupBy(productos.proveedorId);
  const lista = filas.map((p) => ({ ...p, rubros: JSON.parse(p.rubros) as Rubro[], saldos: s.get(p.id) ?? {}, consignadas: conteo.find((x) => x.id === p.id)?.consignadas ?? 0 }));
  return f.conSaldo ? lista.filter((x) => Object.keys(x.saldos).length) : lista;
}

export async function obtenerProveedor(id: number) {
  const [p] = await db.select().from(proveedores).where(eq(proveedores.id, id));
  if (!p) return null;
  const [cc, comprasP, s] = await Promise.all([
    db.select().from(movimientosCcProveedores).where(eq(movimientosCcProveedores.proveedorId, id)).orderBy(desc(movimientosCcProveedores.fecha), desc(movimientosCcProveedores.id)),
    db.select().from(compras).where(eq(compras.proveedorId, id)).orderBy(desc(compras.fecha), desc(compras.id)).limit(50),
    saldos([id]),
  ]);
  return { ...p, rubros: JSON.parse(p.rubros) as Rubro[], cc, compras: comprasP, saldos: s.get(id) ?? {} };
}

/** Lista corta para elegir en formularios. */
export async function opcionesProveedores(rubros?: Rubro[]) {
  const filas = await db.select({ id: proveedores.id, nombre: proveedores.razonSocial, rubros: proveedores.rubros }).from(proveedores).where(eq(proveedores.activo, true)).orderBy(asc(proveedores.razonSocial));
  return filas.filter((f) => !rubros || (JSON.parse(f.rubros) as Rubro[]).some((r) => rubros.includes(r))).map(({ id, nombre }) => ({ id, nombre }));
}

/** Saldo inicial o ajuste de cuenta corriente (por moneda). importe > 0: le debemos. */
export async function movimientoCcProveedorManual(proveedorId: number, m: { tipo: "saldo_inicial" | "ajuste" | "nota_credito"; moneda: string; importe: number; descripcion: string; vencimiento: Date | null }, actor: Actor) {
  if (!Number.isInteger(m.importe) || m.importe === 0) throw new ErrorValidacion("Indicá el importe.");
  if (m.descripcion.trim().length < 3) throw new ErrorValidacion("Escribí el detalle.");
  if (!["ARS", "USD", "EUR"].includes(m.moneda)) throw new ErrorValidacion("Moneda no válida.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(proveedores).where(eq(proveedores.id, proveedorId));
    if (!p) throw new ErrorValidacion("El proveedor no existe.");
    await tx.insert(movimientosCcProveedores).values({ proveedorId, fecha: new Date(), tipo: m.tipo, moneda: m.moneda, importe: m.importe, vencimiento: m.vencimiento, descripcion: m.descripcion.trim(), usuarioId: actor.id });
    await auditar(tx, actor, { accion: "alta", entidad: "proveedor", entidadId: proveedorId, descripcion: `Cuenta corriente de ${p.razonSocial}: ${m.tipo.replace("_", " ")} ${m.moneda} ${(m.importe / 100).toLocaleString("es-AR")} (${m.descripcion.trim()})` });
  });
}

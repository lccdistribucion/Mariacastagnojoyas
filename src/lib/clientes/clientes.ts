/**
 * Clientes: alta y edición (con validación de DNI/CUIT y control de duplicados), lista de deseos y
 * cuenta corriente. Nada se borra: un cliente se desactiva. Todo queda en auditoría.
 */
import { and, asc, desc, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { clienteDeseos, clientes, db, movimientosCcClientes, productos } from "@/db";
import { auditar, diferencias, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { CONDICIONES_IVA, cuitValido, dniValido, normalizarWhatsapp, soloDigitos } from "../identidad";

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const fechaDia = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha no válida.");

export const esquemaCliente = z
  .object({
    nombre: z.string().trim().min(2, "Escribí el nombre del cliente.").max(100),
    tipoDoc: z.enum(["DNI", "CUIT", "CUIL", "PAS"]).nullable(),
    documento: texto(20),
    condicionIva: z.enum(Object.keys(CONDICIONES_IVA) as [keyof typeof CONDICIONES_IVA]),
    domicilio: texto(150),
    localidad: texto(60),
    provincia: texto(40),
    telefono: texto(40),
    whatsapp: texto(40),
    email: z
      .string()
      .trim()
      .max(120)
      .transform((v) => v || null)
      .nullable()
      .optional()
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "El email no es válido."),
    cumpleanos: fechaDia,
    aniversario: fechaDia,
    talles: texto(120),
    preferencias: texto(300),
    notas: texto(1000),
  })
  .transform((d) => {
    let documento = d.documento ?? null;
    if (documento && d.tipoDoc && d.tipoDoc !== "PAS") documento = soloDigitos(documento);
    const whatsapp = d.whatsapp ? normalizarWhatsapp(d.whatsapp) : null;
    return { ...d, documento, whatsappOriginal: d.whatsapp, whatsapp };
  })
  .refine((d) => !d.documento || d.tipoDoc, { message: "Elegí el tipo de documento." })
  .refine((d) => !d.documento || d.tipoDoc !== "DNI" || dniValido(d.documento), { message: "El DNI tiene que tener 7 u 8 números." })
  .refine((d) => !d.documento || !(d.tipoDoc === "CUIT" || d.tipoDoc === "CUIL") || cuitValido(d.documento), { message: "El CUIT/CUIL no es válido (revisá los números)." })
  .refine((d) => !d.whatsappOriginal || d.whatsapp, { message: "El WhatsApp no parece un celular válido (código de área + número)." })
  .refine((d) => d.condicionIva === "consumidor_final" || (d.documento && (d.tipoDoc === "CUIT" || d.tipoDoc === "CUIL")), { message: "Para esa condición frente al IVA hace falta el CUIT." });

export type DatosCliente = z.input<typeof esquemaCliente>;

function validar(d: DatosCliente) {
  const r = esquemaCliente.safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const { whatsappOriginal: _w, ...v } = r.data;
  void _w;
  return v;
}

const foto = (c: Record<string, unknown>) => ({
  Nombre: c.nombre,
  Documento: c.documento ? `${c.tipoDoc} ${c.documento}` : "—",
  "Condición IVA": CONDICIONES_IVA[c.condicionIva as keyof typeof CONDICIONES_IVA],
  Domicilio: [c.domicilio, c.localidad, c.provincia].filter(Boolean).join(", ") || "—",
  Teléfono: c.telefono ?? "—",
  WhatsApp: c.whatsapp ?? "—",
  Email: c.email ?? "—",
  Cumpleaños: c.cumpleanos ?? "—",
  Aniversario: c.aniversario ?? "—",
  Talles: c.talles ?? "—",
  Preferencias: c.preferencias ?? "—",
  Notas: c.notas ?? "—",
});

/** Posibles duplicados: mismo documento, mismo WhatsApp o mismo nombre exacto. */
export async function posiblesDuplicados(d: { nombre: string; documento?: string | null; whatsapp?: string | null }, excepto?: number) {
  const c: SQL[] = [sql`lower(${clientes.nombre}) = ${d.nombre.trim().toLowerCase()}`];
  if (d.documento) c.push(eq(clientes.documento, d.documento));
  if (d.whatsapp) c.push(eq(clientes.whatsapp, d.whatsapp));
  return db
    .select({ id: clientes.id, nombre: clientes.nombre, documento: clientes.documento, whatsapp: clientes.whatsapp })
    .from(clientes)
    .where(and(or(...c), excepto ? ne(clientes.id, excepto) : undefined))
    .limit(5);
}

/** Alta. Si hay un cliente con el mismo nombre o WhatsApp avisa (salvo `aunqueParezcaDuplicado`); el documento repetido nunca se permite. */
export async function crearCliente(datos: DatosCliente, actor: Actor, opciones: { aunqueParezcaDuplicado?: boolean; esDemo?: boolean } = {}) {
  const d = validar(datos);
  const dups = await posiblesDuplicados(d);
  const mismoDoc = d.documento && dups.find((x) => x.documento === d.documento);
  if (mismoDoc) throw new ErrorValidacion(`Ya existe un cliente con ese documento: ${mismoDoc.nombre}.`);
  if (dups.length && !opciones.aunqueParezcaDuplicado)
    throw new ErrorDuplicado(`Ya hay ${dups.length === 1 ? "un cliente parecido" : "clientes parecidos"}: ${dups.map((x) => x.nombre).join(", ")}. Si es otra persona, confirmá el alta.`, dups);
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(clientes).values({ ...d, esDemo: !!opciones.esDemo }).returning({ id: clientes.id });
    await auditar(tx, actor, { accion: "alta", entidad: "cliente", entidadId: c.id, descripcion: `Dio de alta al cliente ${d.nombre}`, despues: foto(d) });
    return c.id;
  });
}

export class ErrorDuplicado extends ErrorValidacion {
  constructor(
    mensaje: string,
    readonly parecidos: { id: number; nombre: string }[],
  ) {
    super(mensaje);
  }
}

export async function editarCliente(id: number, datos: DatosCliente, actor: Actor) {
  const d = validar(datos);
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(clientes).where(eq(clientes.id, id));
    if (!antes) throw new ErrorValidacion("El cliente no existe.");
    if (d.documento) {
      const [otro] = await tx.select().from(clientes).where(and(eq(clientes.documento, d.documento), ne(clientes.id, id)));
      if (otro) throw new ErrorValidacion(`Ese documento ya es de ${otro.nombre}.`);
    }
    const dif = diferencias(foto(antes), foto(d));
    if (!dif.hayCambios) return;
    await tx.update(clientes).set({ ...d, actualizadoEn: new Date() }).where(eq(clientes.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "cliente", entidadId: id, descripcion: `Modificó al cliente ${d.nombre} (${Object.keys(dif.despues).join(", ").toLowerCase()})`, antes: dif.antes, despues: dif.despues });
  });
}

export async function cambiarEstadoCliente(id: number, activo: boolean, actor: Actor) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, id));
    if (!c || c.activo === activo) return;
    await tx.update(clientes).set({ activo }).where(eq(clientes.id, id));
    await auditar(tx, actor, { accion: activo ? "reactivacion" : "desactivacion", entidad: "cliente", entidadId: id, descripcion: `${activo ? "Reactivó" : "Desactivó"} al cliente ${c.nombre}` });
  });
}

const saldoSql = sql<number>`coalesce((select sum(importe) from movimientos_cc_clientes m where m.cliente_id = "clientes"."id" and m.anulado = 0), 0)`;

export async function listarClientes(f: { q?: string; conSaldo?: boolean; inactivos?: boolean; pagina?: number }) {
  const c: SQL[] = [];
  if (!f.inactivos) c.push(eq(clientes.activo, true));
  if (f.q?.trim()) {
    const t = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    const dig = soloDigitos(f.q);
    c.push(or(like(clientes.nombre, t), like(clientes.email, t), like(clientes.localidad, t), ...(dig.length >= 3 ? [like(clientes.documento, `%${dig}%`), like(clientes.whatsapp, `%${dig}%`), like(clientes.telefono, `%${dig}%`)] : []))!);
  }
  if (f.conSaldo) c.push(sql`${saldoSql} <> 0`);
  const where = c.length ? and(...c) : undefined;
  const pagina = Math.max(1, f.pagina ?? 1);
  const filas = await db
    .select({ c: clientes, saldo: saldoSql })
    .from(clientes)
    .where(where)
    .orderBy(asc(clientes.nombre))
    .limit(60)
    .offset((pagina - 1) * 60);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(clientes).where(where);
  return { filas, total, pagina, paginas: Math.max(1, Math.ceil(total / 60)) };
}

export async function obtenerCliente(id: number) {
  const [c] = await db.select().from(clientes).where(eq(clientes.id, id));
  if (!c) return null;
  const [cc, deseos] = await Promise.all([
    db.select().from(movimientosCcClientes).where(eq(movimientosCcClientes.clienteId, id)).orderBy(desc(movimientosCcClientes.fecha), desc(movimientosCcClientes.id)),
    db
      .select({ d: clienteDeseos, codigo: productos.codigo, estadoPieza: productos.estado })
      .from(clienteDeseos)
      .leftJoin(productos, eq(productos.id, clienteDeseos.productoId))
      .where(eq(clienteDeseos.clienteId, id))
      .orderBy(asc(clienteDeseos.cumplido), desc(clienteDeseos.fecha)),
  ]);
  const saldo = cc.filter((m) => !m.anulado).reduce((s, m) => s + m.importe, 0);
  const vencido = cc.filter((m) => !m.anulado && m.importe > 0 && m.vencimiento && m.vencimiento.getTime() < Date.now()).reduce((s, m) => s + m.importe, 0);
  return { ...c, cc, deseos, saldo, vencido: Math.min(vencido, Math.max(saldo, 0)) };
}

/** Saldo inicial o ajuste de cuenta corriente (solo administrador). importe en centavos: + debe, − a favor. */
export async function movimientoCcManual(clienteId: number, m: { tipo: "saldo_inicial" | "ajuste"; importe: number; descripcion: string; vencimiento: Date | null }, actor: Actor) {
  if (!Number.isInteger(m.importe) || m.importe === 0) throw new ErrorValidacion("Indicá el importe.");
  if (m.descripcion.trim().length < 3) throw new ErrorValidacion("Escribí el motivo o detalle.");
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
    if (!c) throw new ErrorValidacion("El cliente no existe.");
    await tx.insert(movimientosCcClientes).values({ clienteId, fecha: new Date(), tipo: m.tipo, importe: m.importe, vencimiento: m.vencimiento, descripcion: m.descripcion.trim(), usuarioId: actor.id });
    await auditar(tx, actor, {
      accion: "alta",
      entidad: "cliente",
      entidadId: clienteId,
      descripcion: `${m.tipo === "saldo_inicial" ? "Cargó saldo inicial" : "Ajustó la cuenta corriente"} de ${c.nombre}: ${(m.importe / 100).toLocaleString("es-AR")} (${m.descripcion.trim()})`,
    });
  });
}

export async function anularMovimientoCc(id: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(movimientosCcClientes).where(eq(movimientosCcClientes.id, id));
    if (!m || m.anulado) return;
    if (!["saldo_inicial", "ajuste"].includes(m.tipo)) throw new ErrorValidacion("Ese movimiento se anula desde su comprobante (venta o cobro).");
    await tx.update(movimientosCcClientes).set({ anulado: true }).where(eq(movimientosCcClientes.id, id));
    await auditar(tx, actor, { accion: "anulacion", entidad: "cliente", entidadId: m.clienteId, descripcion: `Anuló un movimiento de cuenta corriente: ${m.descripcion}`, antes: { Importe: (m.importe / 100).toLocaleString("es-AR") } });
  });
}

export async function agregarDeseo(clienteId: number, d: { descripcion: string; productoId: number | null }, actor: Actor) {
  if (d.descripcion.trim().length < 2 && !d.productoId) throw new ErrorValidacion("Describí qué le gustaría.");
  await db.transaction(async (tx) => {
    let descripcion = d.descripcion.trim();
    if (d.productoId) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, d.productoId));
      if (!p) throw new ErrorValidacion("La pieza no existe.");
      descripcion = descripcion || `${p.codigo} · ${p.nombre}`;
    }
    await tx.insert(clienteDeseos).values({ clienteId, productoId: d.productoId, descripcion, fecha: new Date(), usuarioId: actor.id });
    await auditar(tx, actor, { accion: "alta", entidad: "cliente", entidadId: clienteId, descripcion: `Agregó a la lista de deseos: ${descripcion}` });
  });
}

export async function marcarDeseo(id: number, cumplido: boolean, actor: Actor) {
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(clienteDeseos).where(eq(clienteDeseos.id, id));
    if (!d) return;
    await tx.update(clienteDeseos).set({ cumplido }).where(eq(clienteDeseos.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "cliente", entidadId: d.clienteId, descripcion: `${cumplido ? "Marcó como cumplido" : "Reabrió"} el deseo: ${d.descripcion}` });
  });
}

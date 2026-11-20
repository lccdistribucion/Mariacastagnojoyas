/**
 * Reparaciones y servicios: orden numerada con comprobante de recepción, fotos del estado al ingreso, peso,
 * presupuesto, seña, fecha prometida, taller externo (con su costo, que va a la cuenta corriente del taller),
 * estados (recibida → en taller → lista → avisada → entregada | abandonada) y aviso al cliente por WhatsApp.
 * La entrega se cobra desde el mostrador (renglón «servicio»), y al cobrarla queda «entregada».
 */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { clientes, db, historialEstados, movimientosCcProveedores, proveedores, reparaciones } from "@/db";
import { crearAlerta } from "../alertas";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerConfig } from "../config";
import { completar } from "../clientes/recordatorios";
import { enlaceWhatsapp } from "../identidad";
import { registrarCobroCliente, type PagoIn } from "../ventas/cobros";

export const TRABAJOS = { soldadura: "Soldadura", talle: "Cambio de talle", engarzado: "Engarzado", limpieza: "Limpieza y pulido", grabado: "Grabado", enhebrado: "Enhebrado", reloj: "Reloj (pila / malla)", otro: "Otro" } as const;
export const ESTADOS_REPARACION = { recibida: "Recibida", en_taller: "En taller", lista: "Lista", avisada: "Avisada", entregada: "Entregada", abandonada: "Abandonada" } as const;
export type EstadoReparacion = keyof typeof ESTADOS_REPARACION;
/** Desde qué estados se puede pasar a cada uno (la entrega es solo cobrando). */
export const PASOS: Record<string, EstadoReparacion[]> = {
  recibida: ["en_taller", "lista", "abandonada"],
  en_taller: ["lista", "recibida", "abandonada"],
  lista: ["avisada", "en_taller", "abandonada"],
  avisada: ["lista", "abandonada"],
  abandonada: ["lista"],
  entregada: [],
};

const esquema = z.object({
  clienteId: z.number().int().positive(),
  descripcion: z.string().trim().min(3, "Describí la pieza (por ejemplo «anillo oro 18k con piedra azul»).").max(200),
  trabajos: z.array(z.enum(Object.keys(TRABAJOS) as [keyof typeof TRABAJOS])).min(1, "Elegí qué trabajo hay que hacer."),
  detalle: z.string().trim().max(1000).optional(),
  pesoIngresoMg: z.number().int().min(0).nullable(),
  presupuesto: z.number().int().min(0).nullable(),
  fechaPrometida: z.date().nullable(),
});

export async function crearReparacion(d: z.input<typeof esquema> & { sena: PagoIn[] }, actor: Actor) {
  const r = esquema.safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, r.data.clienteId));
    if (!c) throw new ErrorValidacion("Elegí el cliente.");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${reparaciones.numero}), 0)` }).from(reparaciones);
    const ahora = new Date();
    const [x] = await tx
      .insert(reparaciones)
      .values({ ...r.data, numero: max + 1, fechaIngreso: ahora, trabajos: JSON.stringify(r.data.trabajos), detalle: r.data.detalle || null, usuarioId: actor.id })
      .returning({ id: reparaciones.id, numero: reparaciones.numero });
    await tx.insert(historialEstados).values({ entidad: "reparacion", entidadId: x.id, fecha: ahora, estado: "recibida", nota: "Ingreso", usuarioId: actor.id });
    if (d.sena.reduce((s, p) => s + p.aplicado, 0) > 0) await registrarCobroCliente(c.id, { origen: "sena", referencia: `reparacion:${x.id}`, descripcion: `Seña de la reparación N.º ${x.numero}`, pagos: d.sena }, actor, tx);
    await auditar(tx, actor, { accion: "alta", entidad: "reparacion", entidadId: x.id, descripcion: `Reparación N.º ${x.numero} de ${c.nombre}: ${r.data.descripcion}` });
    return x;
  });
}

export async function cambiarEstadoReparacion(id: number, nuevo: EstadoReparacion, o: { nota?: string; proveedorId?: number | null; costoTaller?: number | null }, actor: Actor) {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(reparaciones).where(eq(reparaciones.id, id));
    if (!r) throw new ErrorValidacion("La reparación no existe.");
    if (!PASOS[r.estado]?.includes(nuevo)) throw new ErrorValidacion(`No se puede pasar de «${ESTADOS_REPARACION[r.estado as EstadoReparacion]}» a «${ESTADOS_REPARACION[nuevo]}».${nuevo === "entregada" ? " La entrega se hace cobrando desde el mostrador." : ""}`);
    const ahora = new Date();
    const cambios: Partial<typeof reparaciones.$inferInsert> = { estado: nuevo };
    if (nuevo === "en_taller") {
      cambios.enviadaTallerEn = ahora;
      cambios.proveedorId = o.proveedorId ?? null;
    }
    if (nuevo === "lista") {
      cambios.listaEn = ahora;
      if (o.costoTaller != null) cambios.costoTaller = o.costoTaller;
      const prov = o.proveedorId ?? r.proveedorId;
      if (prov && o.costoTaller && r.estado === "en_taller") {
        const [p] = await tx.select().from(proveedores).where(eq(proveedores.id, prov));
        await tx.insert(movimientosCcProveedores).values({ proveedorId: prov, fecha: ahora, tipo: "factura", moneda: "ARS", importe: o.costoTaller, descripcion: `Trabajo de taller: reparación N.º ${r.numero}`, usuarioId: actor.id });
        void p;
      }
    }
    await tx.update(reparaciones).set(cambios).where(eq(reparaciones.id, id));
    await tx.insert(historialEstados).values({ entidad: "reparacion", entidadId: id, fecha: ahora, estado: nuevo, nota: o.nota?.trim() || null, usuarioId: actor.id });
    await auditar(tx, actor, { accion: "modificacion", entidad: "reparacion", entidadId: id, descripcion: `Reparación N.º ${r.numero}: ${ESTADOS_REPARACION[r.estado as EstadoReparacion]} → ${ESTADOS_REPARACION[nuevo]}${o.nota ? ` (${o.nota.trim()})` : ""}` });
  });
}

/** Cambia el importe a cobrar (presupuesto final) antes de entregar. */
export async function actualizarPresupuestoReparacion(id: number, presupuesto: number, actor: Actor) {
  if (!Number.isInteger(presupuesto) || presupuesto < 0) throw new ErrorValidacion("Importe no válido.");
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(reparaciones).where(eq(reparaciones.id, id));
    if (!r || r.estado === "entregada") throw new ErrorValidacion("La reparación ya se entregó.");
    await tx.update(reparaciones).set({ presupuesto }).where(eq(reparaciones.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "reparacion", entidadId: id, descripcion: `Reparación N.º ${r.numero}: importe a cobrar`, antes: { Importe: ((r.presupuesto ?? 0) / 100).toLocaleString("es-AR") }, despues: { Importe: (presupuesto / 100).toLocaleString("es-AR") } });
  });
}

export async function obtenerReparacion(id: number) {
  const [r] = await db.select({ r: reparaciones, cliente: clientes, taller: proveedores.razonSocial }).from(reparaciones).innerJoin(clientes, eq(clientes.id, reparaciones.clienteId)).leftJoin(proveedores, eq(proveedores.id, reparaciones.proveedorId)).where(eq(reparaciones.id, id));
  if (!r) return null;
  const historial = await db.select().from(historialEstados).where(and(eq(historialEstados.entidad, "reparacion"), eq(historialEstados.entidadId, id))).orderBy(desc(historialEstados.fecha), desc(historialEstados.id));
  return { ...r.r, trabajos: JSON.parse(r.r.trabajos) as (keyof typeof TRABAJOS)[], cliente: r.cliente, taller: r.taller, historial };
}

export async function listarReparaciones(estados?: EstadoReparacion[], clienteId?: number) {
  return db
    .select({ r: reparaciones, cliente: clientes.nombre })
    .from(reparaciones)
    .innerJoin(clientes, eq(clientes.id, reparaciones.clienteId))
    .where(and(estados?.length ? inArray(reparaciones.estado, estados) : undefined, clienteId ? eq(reparaciones.clienteId, clienteId) : undefined))
    .orderBy(desc(reparaciones.fechaIngreso))
    .limit(300);
}

export async function enlaceAvisoReparacion(id: number) {
  const r = await obtenerReparacion(id);
  if (!r?.cliente.whatsapp) return null;
  const cfg = await leerConfig(["mensajes.reparacion_lista"]);
  return enlaceWhatsapp(r.cliente.whatsapp, completar(cfg["mensajes.reparacion_lista"], { nombre: r.cliente.nombre.split(" ")[0], pieza: r.descripcion.toLowerCase(), numero: String(r.numero) }));
}

/** Tarea diaria: reparaciones atrasadas y no retiradas. */
export async function avisosReparaciones(hoy: string) {
  const dias = (await leerConfig(["reparaciones.dias_abandono"]))["reparaciones.dias_abandono"];
  const atrasadas = await db.select().from(reparaciones).where(and(inArray(reparaciones.estado, ["recibida", "en_taller"]), lt(reparaciones.fechaPrometida, new Date())));
  const sinRetirar = await db.select().from(reparaciones).where(and(inArray(reparaciones.estado, ["lista", "avisada"]), lt(reparaciones.listaEn, new Date(Date.now() - dias * 86400_000))));
  if (atrasadas.length) await crearAlerta({ tipo: "reparacion_atrasada", nivel: "alerta", titulo: `${atrasadas.length} reparación/es atrasada/s`, detalle: atrasadas.map((r) => `N.º ${r.numero} (prometida ${r.fechaPrometida?.toLocaleDateString("es-AR")})`).join(" · "), clave: `rep_atrasada:${hoy}` });
  if (sinRetirar.length) await crearAlerta({ tipo: "reparacion_sin_retirar", nivel: "info", titulo: `${sinRetirar.length} reparación/es lista/s sin retirar hace más de ${dias} días`, detalle: sinRetirar.map((r) => `N.º ${r.numero}`).join(" · "), clave: `rep_sin_retirar:${hoy}` });
}

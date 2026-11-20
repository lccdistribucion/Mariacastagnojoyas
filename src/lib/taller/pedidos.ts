/**
 * Pedidos a medida: presupuesto (precio congelado o sujeto a la cotización del día de entrega), señas en etapas,
 * taller o artesano con su costo, control del metal entregado y recibido (merma), estados y aviso al cliente.
 * Se entrega cobrando desde el mostrador (renglón «servicio»).
 */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { clientes, db, historialEstados, leyesMetal, movimientosCcProveedores, movimientosMetal, pedidos, proveedores } from "@/db";
import { crearAlerta } from "../alertas";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerConfig } from "../config";
import { completar } from "../clientes/recordatorios";
import { fotoCotizaciones } from "../cotizaciones/vigentes";
import { enlaceWhatsapp } from "../identidad";
import { registrarCobroCliente, type PagoIn } from "../ventas/cobros";

export const ESTADOS_PEDIDO = { presupuestado: "Presupuestado", aprobado: "Aprobado", en_taller: "En taller", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" } as const;
export type EstadoPedido = keyof typeof ESTADOS_PEDIDO;
export const PASOS: Record<string, EstadoPedido[]> = {
  presupuestado: ["aprobado", "cancelado"],
  aprobado: ["en_taller", "listo", "cancelado"],
  en_taller: ["listo", "aprobado", "cancelado"],
  listo: ["en_taller"],
  entregado: [],
  cancelado: ["presupuestado"],
};

const esquema = z
  .object({
    clienteId: z.number().int().positive(),
    descripcion: z.string().trim().min(3, "Describí el pedido.").max(500),
    leyId: z.number().int().positive().nullable(),
    piedras: z.string().trim().max(200).optional(),
    talle: z.string().trim().max(20).optional(),
    modoPrecio: z.enum(["congelado", "cotizacion"]),
    presupuesto: z.number().int().min(0),
    gramosEstimadosMg: z.number().int().min(0).nullable(),
    hechura: z.number().int().min(0),
    entregaEstimada: z.date().nullable(),
    notas: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.modoPrecio === "congelado" || (d.leyId && d.gramosEstimadosMg), { message: "Para cobrar a la cotización del día hacen falta el metal y los gramos estimados." })
  .refine((d) => d.modoPrecio === "cotizacion" || d.presupuesto > 0, { message: "Cargá el precio pactado." });

export async function crearPedido(d: z.input<typeof esquema> & { sena: PagoIn[] }, actor: Actor) {
  const r = esquema.safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const conSena = d.sena.reduce((s, p) => s + p.aplicado, 0) > 0;
  const foto = JSON.stringify(await fotoCotizaciones());
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, r.data.clienteId));
    if (!c) throw new ErrorValidacion("Elegí el cliente.");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${pedidos.numero}), 0)` }).from(pedidos);
    const ahora = new Date();
    const estado: EstadoPedido = conSena ? "aprobado" : "presupuestado";
    const [x] = await tx
      .insert(pedidos)
      .values({ ...r.data, piedras: r.data.piedras || null, talle: r.data.talle || null, notas: r.data.notas || null, numero: max + 1, fecha: ahora, estado, cotizaciones: foto, usuarioId: actor.id })
      .returning({ id: pedidos.id, numero: pedidos.numero });
    await tx.insert(historialEstados).values({ entidad: "pedido", entidadId: x.id, fecha: ahora, estado, nota: conSena ? "Aprobado con seña" : "Presupuesto", usuarioId: actor.id });
    if (conSena) await registrarCobroCliente(c.id, { origen: "sena", referencia: `pedido:${x.id}`, descripcion: `Seña del pedido N.º ${x.numero}`, pagos: d.sena }, actor, tx);
    await auditar(tx, actor, { accion: "alta", entidad: "pedido", entidadId: x.id, descripcion: `Pedido a medida N.º ${x.numero} de ${c.nombre}: ${r.data.descripcion}` });
    return x;
  });
}

export async function senaPedido(id: number, pagos: PagoIn[], actor: Actor) {
  const [p] = await db.select().from(pedidos).where(eq(pedidos.id, id));
  if (!p || ["entregado", "cancelado"].includes(p.estado)) throw new ErrorValidacion("El pedido no admite más pagos.");
  await registrarCobroCliente(p.clienteId, { origen: "sena", referencia: `pedido:${id}`, descripcion: `Pago a cuenta del pedido N.º ${p.numero}`, pagos }, actor);
  if (p.estado === "presupuestado") await cambiarEstadoPedido(id, "aprobado", { nota: "Aprobado con pago a cuenta" }, actor);
}

export async function cambiarEstadoPedido(id: number, nuevo: EstadoPedido, o: { nota?: string; proveedorId?: number | null; costoTaller?: number | null; pesoFinalMg?: number | null }, actor: Actor) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, id));
    if (!p) throw new ErrorValidacion("El pedido no existe.");
    if (!PASOS[p.estado]?.includes(nuevo)) throw new ErrorValidacion(`No se puede pasar de «${ESTADOS_PEDIDO[p.estado as EstadoPedido]}» a «${ESTADOS_PEDIDO[nuevo]}».${nuevo === "entregado" ? " La entrega se hace cobrando desde el mostrador." : ""}`);
    const ahora = new Date();
    const cambios: Partial<typeof pedidos.$inferInsert> = { estado: nuevo };
    if (nuevo === "aprobado" && p.estado === "presupuestado") cambios.cotizaciones = JSON.stringify(await fotoCotizaciones());
    if (nuevo === "en_taller" && o.proveedorId !== undefined) cambios.proveedorId = o.proveedorId;
    if (nuevo === "listo") {
      if (o.pesoFinalMg != null) cambios.pesoFinalMg = o.pesoFinalMg;
      if (o.costoTaller != null) cambios.costoTaller = o.costoTaller;
      const prov = o.proveedorId ?? p.proveedorId;
      if (prov && o.costoTaller) await tx.insert(movimientosCcProveedores).values({ proveedorId: prov, fecha: ahora, tipo: "factura", moneda: "ARS", importe: o.costoTaller, descripcion: `Trabajo de taller: pedido N.º ${p.numero}`, usuarioId: actor.id });
    }
    await tx.update(pedidos).set(cambios).where(eq(pedidos.id, id));
    await tx.insert(historialEstados).values({ entidad: "pedido", entidadId: id, fecha: ahora, estado: nuevo, nota: o.nota?.trim() || null, usuarioId: actor.id });
    await auditar(tx, actor, { accion: "modificacion", entidad: "pedido", entidadId: id, descripcion: `Pedido N.º ${p.numero}: ${ESTADOS_PEDIDO[p.estado as EstadoPedido]} → ${ESTADOS_PEDIDO[nuevo]}${o.nota ? ` (${o.nota.trim()})` : ""}` });
  });
}

/**
 * Metal del pedido: lo que se le entrega al taller sale del metal propio; lo que devuelve (sobrante) vuelve.
 * Merma = entregado − devuelto − peso final de la pieza.
 */
export async function metalTaller(id: number, m: { entregaMg?: number; devolucionMg?: number }, actor: Actor) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, id));
    if (!p || !p.leyId) throw new ErrorValidacion("El pedido no tiene metal (ley) definido.");
    const [ley] = await tx.select().from(leyesMetal).where(eq(leyesMetal.id, p.leyId));
    const ahora = new Date();
    if (m.entregaMg) {
      await tx.insert(movimientosMetal).values({ fecha: ahora, leyId: p.leyId, pesoMg: -m.entregaMg, tipo: "taller_entrega", descripcion: `Entregado al taller para el pedido N.º ${p.numero}`, usuarioId: actor.id });
      await tx.update(pedidos).set({ metalEntregadoMg: p.metalEntregadoMg + m.entregaMg }).where(eq(pedidos.id, id));
    }
    if (m.devolucionMg) {
      await tx.insert(movimientosMetal).values({ fecha: ahora, leyId: p.leyId, pesoMg: m.devolucionMg, tipo: "taller_recepcion", descripcion: `Sobrante devuelto por el taller (pedido N.º ${p.numero})`, usuarioId: actor.id });
      await tx.update(pedidos).set({ metalDevueltoMg: p.metalDevueltoMg + m.devolucionMg }).where(eq(pedidos.id, id));
    }
    await auditar(tx, actor, { accion: "modificacion", entidad: "pedido", entidadId: id, descripcion: `Pedido N.º ${p.numero}: metal ${ley?.nombre}${m.entregaMg ? ` entregado ${(m.entregaMg / 1000).toLocaleString("es-AR")} g` : ""}${m.devolucionMg ? ` devuelto ${(m.devolucionMg / 1000).toLocaleString("es-AR")} g` : ""}` });
  });
}

export const merma = (p: { metalEntregadoMg: number; metalDevueltoMg: number; pesoFinalMg: number | null }) => (p.pesoFinalMg == null || !p.metalEntregadoMg ? null : p.metalEntregadoMg - p.metalDevueltoMg - p.pesoFinalMg);

export async function obtenerPedido(id: number) {
  const [r] = await db.select({ p: pedidos, cliente: clientes, taller: proveedores.razonSocial, ley: leyesMetal.nombre }).from(pedidos).innerJoin(clientes, eq(clientes.id, pedidos.clienteId)).leftJoin(proveedores, eq(proveedores.id, pedidos.proveedorId)).leftJoin(leyesMetal, eq(leyesMetal.id, pedidos.leyId)).where(eq(pedidos.id, id));
  if (!r) return null;
  const historial = await db.select().from(historialEstados).where(and(eq(historialEstados.entidad, "pedido"), eq(historialEstados.entidadId, id))).orderBy(desc(historialEstados.fecha), desc(historialEstados.id));
  return { ...r.p, cliente: r.cliente, taller: r.taller, ley: r.ley, historial, merma: merma(r.p) };
}

export async function listarPedidos(estados?: EstadoPedido[], clienteId?: number) {
  return db
    .select({ p: pedidos, cliente: clientes.nombre })
    .from(pedidos)
    .innerJoin(clientes, eq(clientes.id, pedidos.clienteId))
    .where(and(estados?.length ? inArray(pedidos.estado, estados) : undefined, clienteId ? eq(pedidos.clienteId, clienteId) : undefined))
    .orderBy(desc(pedidos.fecha))
    .limit(300);
}

export async function enlaceAvisoPedido(id: number) {
  const p = await obtenerPedido(id);
  if (!p?.cliente.whatsapp) return null;
  const cfg = await leerConfig(["mensajes.pedido_listo"]);
  return enlaceWhatsapp(p.cliente.whatsapp, completar(cfg["mensajes.pedido_listo"], { nombre: p.cliente.nombre.split(" ")[0], numero: String(p.numero) }));
}

export async function avisosPedidos(hoy: string) {
  const atrasados = await db.select().from(pedidos).where(and(inArray(pedidos.estado, ["aprobado", "en_taller"]), lt(pedidos.entregaEstimada, new Date())));
  if (atrasados.length) await crearAlerta({ tipo: "pedido_atrasado", nivel: "alerta", titulo: `${atrasados.length} pedido/s a medida atrasado/s`, detalle: atrasados.map((p) => `N.º ${p.numero}`).join(" · "), clave: `pedido_atrasado:${hoy}` });
}

/** Presupuestos: guardan los precios del día y su validez. Al convertirse en venta, si vencieron, se recalculan. */
import { desc, eq, sql } from "drizzle-orm";
import { clientes, db, presupuestos } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerUna } from "../config";
import { fotoCotizaciones } from "../cotizaciones/vigentes";
import { contextoPrecios } from "../stock/consultas";
import { armarRenglones, calcularTotales, type ItemIn, type Renglon } from "./motor";

export async function crearPresupuesto(d: { clienteId: number | null; listaId: number | null; items: ItemIn[]; descuentoPct: number; notas?: string; validezDias?: number }, permisos: { modificarPrecios: boolean }, actor: Actor) {
  if (!d.items.length) throw new ErrorValidacion("El presupuesto no tiene nada.");
  if (d.items.some((i) => i.tipo !== "pieza")) throw new ErrorValidacion("El presupuesto es para piezas del stock (los pedidos a medida tienen su propio presupuesto).");
  const dias = d.validezDias ?? (await leerUna("presupuestos.validez_dias"));
  const ctx = await contextoPrecios();
  const foto = JSON.stringify(await fotoCotizaciones());
  return db.transaction(async (tx) => {
    const renglones = await armarRenglones(tx, { ...d, presupuestoId: null, reservaId: null }, permisos, ctx);
    const { total } = calcularTotales(renglones, d.descuentoPct, 0);
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${presupuestos.numero}), 0)` }).from(presupuestos);
    const ahora = new Date();
    const [p] = await tx
      .insert(presupuestos)
      .values({ numero: max + 1, fecha: ahora, vence: new Date(ahora.getTime() + dias * 86400_000), clienteId: d.clienteId, vendedorId: actor.id ?? 0, items: JSON.stringify(renglones), listaId: d.listaId, descuentoPct: d.descuentoPct, total, cotizaciones: foto, notas: d.notas?.trim() || null })
      .returning({ id: presupuestos.id, numero: presupuestos.numero });
    await auditar(tx, actor, { accion: "alta", entidad: "presupuesto", entidadId: p.id, descripcion: `Presupuesto N.º ${p.numero}: $ ${(total / 100).toLocaleString("es-AR")} (vale ${dias} días)` });
    return p;
  });
}

export async function obtenerPresupuesto(id: number) {
  const [p] = await db.select({ p: presupuestos, cliente: clientes.nombre }).from(presupuestos).leftJoin(clientes, eq(clientes.id, presupuestos.clienteId)).where(eq(presupuestos.id, id));
  if (!p) return null;
  return { ...p.p, cliente: p.cliente, renglones: JSON.parse(p.p.items) as Renglon[], vencido: p.p.estado === "vigente" && p.p.vence.getTime() < Date.now() };
}

export async function listarPresupuestos() {
  return db.select({ p: presupuestos, cliente: clientes.nombre }).from(presupuestos).leftJoin(clientes, eq(clientes.id, presupuestos.clienteId)).orderBy(desc(presupuestos.fecha)).limit(200);
}

export async function anularPresupuesto(id: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(presupuestos).where(eq(presupuestos.id, id));
    if (!p || p.estado !== "vigente") return;
    await tx.update(presupuestos).set({ estado: "anulado" }).where(eq(presupuestos.id, id));
    await auditar(tx, actor, { accion: "anulacion", entidad: "presupuesto", entidadId: id, descripcion: `Anuló el presupuesto N.º ${p.numero}` });
  });
}

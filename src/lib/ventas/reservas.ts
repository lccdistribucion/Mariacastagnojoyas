/**
 * Reservas de piezas con o sin seña. La pieza queda «reservada» (o «señada» si dejó plata) hasta la fecha límite.
 * La seña queda como SALDO A FAVOR del cliente y al retirar la pieza se usa como pago.
 * Si vence, la pieza se libera sola (tarea diaria) y llega un aviso; la seña sigue a favor del cliente.
 */
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { clientes, db, movimientosStock, productos, reservaItems, reservas } from "@/db";
import { crearAlerta } from "../alertas";
import { auditar, SISTEMA, type Actor } from "../auditoria";
import { ErrorValidacion, leerUna } from "../config";
import { contextoPrecios, conPrecio } from "../stock/consultas";
import { registrarCobroCliente, type PagoIn } from "./cobros";

export async function crearReserva(d: { clienteId: number; productoIds: number[]; dias?: number; precioCongelado: boolean; sena: PagoIn[]; notas?: string }, actor: Actor) {
  if (!d.productoIds.length) throw new ErrorValidacion("Elegí qué piezas se reservan.");
  const dias = d.dias ?? (await leerUna("reservas.dias"));
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new ErrorValidacion("Plazo de reserva no válido.");
  const ctx = await contextoPrecios();
  const conSena = d.sena.reduce((s, p) => s + p.aplicado, 0) > 0;
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, d.clienteId));
    if (!c) throw new ErrorValidacion("Elegí el cliente de la reserva.");
    const ahora = new Date();
    const [r] = await tx.insert(reservas).values({ clienteId: d.clienteId, fecha: ahora, vence: new Date(ahora.getTime() + dias * 86400_000), precioCongelado: d.precioCongelado, notas: d.notas?.trim() || null, usuarioId: actor.id }).returning({ id: reservas.id });
    const estado = conSena ? "senado" : "reservado";
    for (const id of d.productoIds) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, id));
      if (!p) throw new ErrorValidacion("Una de las piezas no existe.");
      if (p.tipo !== "unica") throw new ErrorValidacion(`${p.codigo}: se reservan piezas únicas.`);
      if (p.estado !== "disponible") throw new ErrorValidacion(`${p.codigo} no está disponible (${p.estado}).`);
      const precio = conPrecio({ p }, ctx).precio.vigente;
      if (!precio) throw new ErrorValidacion(`${p.codigo} no tiene precio.`);
      await tx.insert(reservaItems).values({ reservaId: r.id, productoId: p.id, precioPactado: precio, estadoPrevio: p.estado });
      await tx.update(productos).set({ estado, actualizadoEn: ahora }).where(eq(productos.id, p.id));
      await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "estado", estadoAntes: p.estado, estadoDespues: estado, motivo: `Reservada para ${c.nombre} hasta el ${new Date(ahora.getTime() + dias * 86400_000).toLocaleDateString("es-AR")}`, documento: `reserva:${r.id}`, usuarioId: actor.id, stockResultante: p.cantidad });
    }
    if (conSena) await registrarCobroCliente(d.clienteId, { origen: "sena", referencia: `reserva:${r.id}`, descripcion: `Seña de la reserva N.º ${r.id}`, pagos: d.sena }, actor, tx);
    await auditar(tx, actor, { accion: "alta", entidad: "reserva", entidadId: r.id, descripcion: `Reserva N.º ${r.id} para ${c.nombre}: ${d.productoIds.length} pieza/s, ${dias} días${conSena ? " (con seña)" : ""}` });
    return r.id;
  });
}

/** Cancelar (a pedido) o vencer (automático): las piezas vuelven a estar disponibles. La seña queda a favor del cliente. */
export async function cerrarReserva(id: number, motivo: "cancelada" | "vencida", actor: Actor) {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(reservas).where(eq(reservas.id, id));
    if (!r || r.estado !== "activa") return;
    const its = await tx.select().from(reservaItems).where(eq(reservaItems.reservaId, id));
    const ahora = new Date();
    for (const it of its) {
      const [p] = await tx.select().from(productos).where(eq(productos.id, it.productoId));
      if (p && ["reservado", "senado"].includes(p.estado)) {
        await tx.update(productos).set({ estado: it.estadoPrevio, actualizadoEn: ahora }).where(eq(productos.id, p.id));
        await tx.insert(movimientosStock).values({ productoId: p.id, fecha: ahora, tipo: "estado", estadoAntes: p.estado, estadoDespues: it.estadoPrevio, motivo: `Reserva ${motivo}`, documento: `reserva:${id}`, usuarioId: actor.id, stockResultante: p.cantidad });
      }
    }
    await tx.update(reservas).set({ estado: motivo }).where(eq(reservas.id, id));
    await auditar(tx, actor, { accion: "modificacion", entidad: "reserva", entidadId: id, descripcion: `Reserva N.º ${id} ${motivo}: las piezas vuelven a estar disponibles` });
  });
}

/** Tarea diaria: vence las reservas pasadas de fecha y avisa al administrador. */
export async function vencerReservas() {
  const vencidas = await db.select().from(reservas).where(and(eq(reservas.estado, "activa"), lt(reservas.vence, new Date())));
  for (const r of vencidas) {
    await cerrarReserva(r.id, "vencida", SISTEMA);
    const [c] = await db.select().from(clientes).where(eq(clientes.id, r.clienteId));
    await crearAlerta({ tipo: "reserva_vencida", nivel: "alerta", titulo: `Venció la reserva N.º ${r.id} de ${c?.nombre ?? "un cliente"}`, detalle: "Las piezas volvieron a estar disponibles. Si dejó seña, sigue como saldo a favor del cliente (se puede devolver o retener).", clave: `reserva_vencida:${r.id}` });
  }
  return vencidas.length;
}

export async function listarReservas(soloActivas = false) {
  const filas = await db.select({ r: reservas, cliente: clientes.nombre }).from(reservas).innerJoin(clientes, eq(clientes.id, reservas.clienteId)).where(soloActivas ? eq(reservas.estado, "activa") : undefined).orderBy(desc(reservas.fecha)).limit(200);
  const ids = filas.map((f) => f.r.id);
  const items = ids.length ? await db.select({ i: reservaItems, codigo: productos.codigo, nombre: productos.nombre }).from(reservaItems).innerJoin(productos, eq(productos.id, reservaItems.productoId)).where(inArray(reservaItems.reservaId, ids)) : [];
  return filas.map((f) => ({ ...f, items: items.filter((x) => x.i.reservaId === f.r.id) }));
}

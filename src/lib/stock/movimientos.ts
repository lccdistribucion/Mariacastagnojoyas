/**
 * Movimientos de stock: ajustes (con motivo obligatorio y autorización), cambios de estado y ubicación,
 * y piezas que salen del local (ferias, pruebas de clientes) con su devolución. Todo deja rastro en
 * `movimientos_stock` y en auditoría, dentro de la misma transacción.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, movimientosStock, productos, salidasPiezas, ubicaciones } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerUna } from "../config";
import { DESTINOS_SALIDA, ESTADOS, ESTADOS_MANUALES, MOTIVOS_AJUSTE, type EstadoPieza, type MotivoAjuste } from "./tipos";

const nombreEstado = (e: string) => ESTADOS[e as EstadoPieza] ?? e;

/**
 * Ajuste de stock. Para artículos por cantidad: suma o resta unidades. Para piezas únicas: una pérdida, rotura
 * o faltante la da de BAJA; un «sobrante» la vuelve a poner disponible.
 * Quien llama debe verificar el permiso «ajustar_stock» o pedir la clave de un administrador (autorizadoPor).
 */
export async function ajustarStock(
  id: number,
  a: { delta: number; motivo: MotivoAjuste; detalle: string },
  actor: Actor,
  autorizadoPor: number | null,
) {
  if (!(a.motivo in MOTIVOS_AJUSTE)) throw new ErrorValidacion("Elegí el motivo del ajuste.");
  if (a.detalle.trim().length < 3) throw new ErrorValidacion("Explicá brevemente el motivo del ajuste.");
  const permitirNegativo = await leerUna("stock.permitir_negativo");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(productos).where(eq(productos.id, id));
    if (!p) throw new ErrorValidacion("La pieza no existe.");
    let cantidad = p.cantidad;
    let estado = p.estado;
    if (p.tipo === "unica") {
      if (a.motivo === "sobrante") {
        if (p.estado !== "baja") throw new ErrorValidacion("La pieza ya figura en stock.");
        cantidad = 1;
        estado = "disponible";
      } else {
        if (p.estado === "baja" || p.estado === "vendido") throw new ErrorValidacion(`La pieza ya está ${nombreEstado(p.estado).toLowerCase()}.`);
        cantidad = 0;
        estado = "baja";
      }
    } else {
      if (!Number.isInteger(a.delta) || a.delta === 0) throw new ErrorValidacion("Indicá cuántas unidades se suman o se restan.");
      cantidad = p.cantidad + a.delta;
      if (cantidad < 0 && !permitirNegativo) throw new ErrorValidacion(`No alcanza el stock (hay ${p.cantidad}). El stock negativo está bloqueado en Configuración.`);
    }
    const ahora = new Date();
    await tx.update(productos).set({ cantidad, estado, actualizadoEn: ahora }).where(eq(productos.id, id));
    await tx.insert(movimientosStock).values({
      productoId: id,
      fecha: ahora,
      tipo: "ajuste",
      cantidad: cantidad - p.cantidad,
      stockResultante: cantidad,
      estadoAntes: p.estado,
      estadoDespues: estado,
      motivo: `${MOTIVOS_AJUSTE[a.motivo]}: ${a.detalle.trim()}`,
      usuarioId: actor.id,
      autorizadoPor,
    });
    await auditar(tx, actor, {
      accion: "modificacion",
      entidad: "producto",
      entidadId: id,
      descripcion: `Ajuste de stock de ${p.codigo} (${MOTIVOS_AJUSTE[a.motivo]}: ${a.detalle.trim()})${autorizadoPor && autorizadoPor !== actor.id ? " — autorizado por un administrador" : ""}`,
      antes: { Cantidad: p.cantidad, Estado: nombreEstado(p.estado) },
      despues: { Cantidad: cantidad, Estado: nombreEstado(estado) },
    });
    return { cantidad, estado };
  });
}

/** Cambio de estado manual (en reparación, en taller, en consignación afuera, disponible). */
export async function cambiarEstado(id: number, nuevo: EstadoPieza, nota: string, actor: Actor) {
  if (!ESTADOS_MANUALES.includes(nuevo)) throw new ErrorValidacion("Ese estado no se puede elegir a mano.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(productos).where(eq(productos.id, id));
    if (!p) throw new ErrorValidacion("La pieza no existe.");
    if (!ESTADOS_MANUALES.includes(p.estado as EstadoPieza))
      throw new ErrorValidacion(`La pieza está ${nombreEstado(p.estado).toLowerCase()}: ese estado se cambia desde ${p.estado === "afuera" ? "«Volvió al local»" : "su operación (venta, seña, ajuste)"}.`);
    if (p.estado === nuevo) return;
    const ahora = new Date();
    await tx.update(productos).set({ estado: nuevo, actualizadoEn: ahora }).where(eq(productos.id, id));
    await tx.insert(movimientosStock).values({ productoId: id, fecha: ahora, tipo: "estado", estadoAntes: p.estado, estadoDespues: nuevo, motivo: nota.trim() || null, usuarioId: actor.id, stockResultante: p.cantidad });
    await auditar(tx, actor, {
      accion: "modificacion",
      entidad: "producto",
      entidadId: id,
      descripcion: `Cambió el estado de ${p.codigo}${nota.trim() ? ` (${nota.trim()})` : ""}`,
      antes: { Estado: nombreEstado(p.estado) },
      despues: { Estado: nombreEstado(nuevo) },
    });
  });
}

export async function cambiarUbicacion(id: number, ubicacionId: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(productos).where(eq(productos.id, id));
    const [u] = await tx.select().from(ubicaciones).where(eq(ubicaciones.id, ubicacionId));
    if (!p || !u) throw new ErrorValidacion("Pieza o ubicación inexistente.");
    if (p.ubicacionId === ubicacionId) return;
    const [antes] = p.ubicacionId ? await tx.select().from(ubicaciones).where(eq(ubicaciones.id, p.ubicacionId)) : [];
    const ahora = new Date();
    await tx.update(productos).set({ ubicacionId, actualizadoEn: ahora }).where(eq(productos.id, id));
    await tx.insert(movimientosStock).values({ productoId: id, fecha: ahora, tipo: "ubicacion", ubicacionAntes: p.ubicacionId, ubicacionDespues: ubicacionId, usuarioId: actor.id, stockResultante: p.cantidad });
    await auditar(tx, actor, { accion: "modificacion", entidad: "producto", entidadId: id, descripcion: `Movió ${p.codigo} de ubicación`, antes: { Ubicación: antes?.nombre ?? "—" }, despues: { Ubicación: u.nombre } });
  });
}

/** Una pieza sale del local (feria, exhibición, prueba de un cliente) con fecha de devolución esperada. */
export async function registrarSalida(
  id: number,
  s: { destino: keyof typeof DESTINOS_SALIDA; detalle: string; responsable: string; devolucionEsperada: Date; notas?: string },
  actor: Actor,
) {
  if (!(s.destino in DESTINOS_SALIDA)) throw new ErrorValidacion("Elegí el destino.");
  if (s.detalle.trim().length < 2) throw new ErrorValidacion("Indicá a dónde va o con quién (cliente, feria…).");
  if (Number.isNaN(s.devolucionEsperada.getTime()) || s.devolucionEsperada.getTime() < Date.now() - 86400_000) throw new ErrorValidacion("La fecha de devolución tiene que ser hoy o más adelante.");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(productos).where(eq(productos.id, id));
    if (!p) throw new ErrorValidacion("La pieza no existe.");
    if (p.tipo !== "unica") throw new ErrorValidacion("Las salidas se registran para piezas únicas.");
    if (p.estado !== "disponible") throw new ErrorValidacion(`La pieza está ${nombreEstado(p.estado).toLowerCase()}: solo sale del local una pieza disponible.`);
    const ahora = new Date();
    const [salida] = await tx
      .insert(salidasPiezas)
      .values({ productoId: id, destino: s.destino, detalle: s.detalle.trim(), responsable: s.responsable.trim() || null, fechaSalida: ahora, devolucionEsperada: s.devolucionEsperada, estadoPrevio: p.estado, usuarioId: actor.id, notas: s.notas?.trim() || null })
      .returning({ id: salidasPiezas.id });
    await tx.update(productos).set({ estado: "afuera", actualizadoEn: ahora }).where(eq(productos.id, id));
    await tx.insert(movimientosStock).values({ productoId: id, fecha: ahora, tipo: "salida", estadoAntes: p.estado, estadoDespues: "afuera", motivo: `${DESTINOS_SALIDA[s.destino]}: ${s.detalle.trim()}`, documento: `salida:${salida.id}`, usuarioId: actor.id, stockResultante: p.cantidad });
    await auditar(tx, actor, { accion: "modificacion", entidad: "producto", entidadId: id, descripcion: `Retiró ${p.codigo} del local (${DESTINOS_SALIDA[s.destino]}: ${s.detalle.trim()})`, antes: { Estado: nombreEstado(p.estado) }, despues: { Estado: nombreEstado("afuera"), "Vuelve el": s.devolucionEsperada.toLocaleDateString("es-AR") } });
    return salida.id;
  });
}

export async function registrarDevolucion(salidaId: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(salidasPiezas).where(and(eq(salidasPiezas.id, salidaId), isNull(salidasPiezas.devueltaEn)));
    if (!s) throw new ErrorValidacion("Esa salida ya fue devuelta o no existe.");
    const [p] = await tx.select().from(productos).where(eq(productos.id, s.productoId));
    const ahora = new Date();
    await tx.update(salidasPiezas).set({ devueltaEn: ahora }).where(eq(salidasPiezas.id, salidaId));
    await tx.update(productos).set({ estado: s.estadoPrevio, actualizadoEn: ahora }).where(eq(productos.id, s.productoId));
    await tx.insert(movimientosStock).values({ productoId: s.productoId, fecha: ahora, tipo: "devolucion", estadoAntes: "afuera", estadoDespues: s.estadoPrevio, documento: `salida:${s.id}`, usuarioId: actor.id, stockResultante: p.cantidad });
    await auditar(tx, actor, { accion: "modificacion", entidad: "producto", entidadId: s.productoId, descripcion: `${p.codigo} volvió al local (${s.detalle})`, antes: { Estado: nombreEstado("afuera") }, despues: { Estado: nombreEstado(s.estadoPrevio) } });
  });
}

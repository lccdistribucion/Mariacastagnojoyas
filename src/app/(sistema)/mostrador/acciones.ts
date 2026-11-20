"use server";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { clientes, db, leyesMetal, productoFotos, productos } from "@/db";
import { autorizarConAdmin } from "@/lib/auth/autorizacion";
import { actorDe, requiereUsuario } from "@/lib/auth/sesion";
import { crearCliente } from "@/lib/clientes/clientes";
import { ErrorValidacion, leerUna } from "@/lib/config";
import { conPrecio, contextoPrecios, listarStock } from "@/lib/stock/consultas";
import { cotizacionesCobro, saldoCliente, senaDisponible, type PagoIn } from "@/lib/ventas/cobros";
import { armarRenglones, calcularTotales, ErrorDescuento, registrarVenta, valorCanje, type CanjeIn, type ItemIn } from "@/lib/ventas/motor";
import { crearPresupuesto } from "@/lib/ventas/presupuestos";
import { configuracionFiscal, facturarVenta } from "@/lib/facturacion/emision";
import { resultadoFiscal, type ResultadoFiscal } from "@/lib/facturacion/vista";
import { crearReserva } from "@/lib/ventas/reservas";

export type Carrito = {
  clienteId: number | null;
  listaId: number | null;
  items: ItemIn[];
  canjes: CanjeIn[];
  descuentoPct: number;
  tipoComprobante: "factura" | "interno";
  notas?: string;
  presupuestoId?: number | null;
  reservaId?: number | null;
};

async function permisos(autorizacion?: { usuario: string; clave: string } | null, motivo = "descuento mayor al permitido") {
  const u = await requiereUsuario();
  const general = await leerUna("ventas.descuento_max_pct");
  let autorizadoPor: number | null = null;
  if (autorizacion?.usuario) {
    const a = await autorizarConAdmin(await actorDe(u), autorizacion, motivo);
    if (!a.ok) throw new ErrorValidacion(a.error);
    autorizadoPor = a.adminId;
  }
  return {
    u,
    p: {
      modificarPrecios: u.permisos.has("modificar_precios"),
      sinFacturar: u.permisos.has("cargar_sin_facturar"),
      // El administrador no tiene tope de descuento.
      descuentoMaxPct: u.rol === "admin" ? 10000 : (u.descuentoMaxPct ?? general),
      autorizadoPor,
    },
  };
}

export async function buscarPiezas(q: string) {
  await requiereUsuario();
  const t = q.trim();
  if (!t) return [];
  const r = await listarStock({ q: t, estado: "disponible" });
  // Packaging e insumos no se venden en el mostrador.
  return r.filas.filter((x) => ["unica", "cantidad"].includes(x.p.tipo)).slice(0, 24).map((x) => ({
    id: x.p.id,
    codigo: x.p.codigo,
    barras: x.p.codigoBarras,
    nombre: x.p.nombre,
    tipo: x.p.tipo,
    cantidad: x.p.cantidad,
    foto: x.foto,
    metal: [x.ley, x.p.metalDetalle].filter(Boolean).join(" · "),
    pesoNetoMg: x.p.pesoNetoMg,
    talle: x.p.talle,
    precio: x.precio.vigente,
    porGramo: x.precio.porGramo,
  }));
}

export async function buscarClientes(q: string) {
  await requiereUsuario();
  const t = `%${q.trim().replace(/[%_]/g, "")}%`;
  if (q.trim().length < 2) return [];
  const filas = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.activo, true), or(like(clientes.nombre, t), like(clientes.documento, t), like(clientes.whatsapp, t))))
    .limit(10);
  return Promise.all(filas.map(async (c) => ({ id: c.id, nombre: c.nombre, documento: c.documento, saldo: await saldoCliente(c.id) })));
}

export async function clienteRapido(d: { nombre: string; documento: string; whatsapp: string }) {
  const u = await requiereUsuario();
  try {
    const doc = d.documento.replace(/\D/g, "");
    const id = await crearCliente(
      { nombre: d.nombre, tipoDoc: doc ? (doc.length === 11 ? "CUIT" : "DNI") : null, documento: doc || null, condicionIva: "consumidor_final", whatsapp: d.whatsapp || null },
      await actorDe(u),
      { aunqueParezcaDuplicado: true },
    );
    return { id, nombre: d.nombre, documento: doc || null, saldo: 0 };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

/** Precios y totales calculados por el sistema (la pantalla no decide precios). */
export async function vistaPrevia(c: Carrito) {
  const { p } = await permisos();
  try {
    const ctx = await contextoPrecios();
    const renglones = await armarRenglones(db, c, p, ctx);
    const canjes = [];
    for (const x of c.canjes) canjes.push({ ...x, ...(await valorCanje(x)) });
    const t = calcularTotales(renglones, c.descuentoPct, canjes.reduce((s, x) => s + x.valor, 0));
    // Señas disponibles de lo que se está cobrando (reserva o servicios).
    const refs = [c.reservaId ? `reserva:${c.reservaId}` : null, ...c.items.filter((i) => i.tipo === "servicio").map((i) => (i as { referencia: string }).referencia)].filter(Boolean) as string[];
    const senas = [];
    for (const r of refs) {
      const disp = await senaDisponible(r);
      if (disp > 0) senas.push({ ref: r, disponible: disp });
    }
    const saldo = c.clienteId ? await saldoCliente(c.clienteId) : 0;
    return { ok: true as const, renglones, canjes, ...t, canje: canjes.reduce((s, x) => s + x.valor, 0), senas, saldoCliente: saldo, descuentoMaxPct: p.descuentoMaxPct };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function confirmarVenta(c: Carrito, pagos: PagoIn[], autorizacion: { usuario: string; clave: string } | null) {
  try {
    const { u, p } = await permisos(autorizacion, `descuento de ${c.descuentoPct / 100} % en el mostrador`);
    const actor = await actorDe(u);
    const v = await registrarVenta({ ...c, pagos }, p, actor);
    // Factura electrónica: se pide el CAE al confirmar. Si ARCA falla, la venta igual queda registrada.
    let fiscal: (ResultadoFiscal & { id?: number }) | null = null;
    if (c.tipoComprobante === "factura" && (await configuracionFiscal()).alVender) {
      try {
        const cf = await facturarVenta(v.id, actor);
        fiscal = { ...resultadoFiscal(cf), id: cf.estado === "autorizado" ? cf.id : undefined };
      } catch (e) {
        fiscal = { aviso: `La venta quedó registrada pero no se pudo facturar: ${e instanceof Error ? e.message : String(e)}. Se puede facturar desde la venta.` };
      }
    }
    return { ok: true as const, id: v.id, numero: v.numero, fiscal };
  } catch (e) {
    if (e instanceof ErrorDescuento) return { ok: false as const, error: e.message, pideAutorizacion: true };
    if (e instanceof ErrorValidacion) return { ok: false as const, error: e.message };
    // Índice único: alguien vendió la misma pieza un instante antes.
    if (String(e).includes("pieza_unica_vendida_una_vez") || String((e as { cause?: unknown }).cause).includes("UNIQUE")) return { ok: false as const, error: "Una de las piezas se acaba de vender en otro equipo." };
    throw e;
  }
}

export async function guardarPresupuesto(c: Carrito) {
  try {
    const { u, p } = await permisos();
    const r = await crearPresupuesto(c, p, await actorDe(u));
    return { ok: true as const, id: r.id };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function reservar(c: Carrito, d: { dias: number; precioCongelado: boolean; sena: PagoIn[] }) {
  const u = await requiereUsuario();
  try {
    if (!c.clienteId) throw new ErrorValidacion("Para reservar hay que elegir el cliente.");
    const ids = c.items.filter((i) => i.tipo === "pieza").map((i) => (i as { productoId: number }).productoId);
    const id = await crearReserva({ clienteId: c.clienteId, productoIds: ids, dias: d.dias, precioCongelado: d.precioCongelado, sena: d.sena }, await actorDe(u));
    return { ok: true as const, id };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function datosParaCobrar() {
  await requiereUsuario();
  return cotizacionesCobro();
}

/** Piezas para precargar el mostrador (desde una reserva, un presupuesto o el código de una pieza). */
export async function piezasPorId(ids: number[]) {
  await requiereUsuario();
  if (!ids.length) return [];
  const ctx = await contextoPrecios();
  const filas = await db.select({ p: productos, ley: leyesMetal.nombre }).from(productos).leftJoin(leyesMetal, eq(leyesMetal.id, productos.leyId)).where(inArray(productos.id, ids));
  const fotos = await db.select().from(productoFotos).where(and(inArray(productoFotos.productoId, ids), eq(productoFotos.activa, true))).orderBy(asc(productoFotos.orden));
  return filas.map(({ p, ley }) => ({
    id: p.id,
    codigo: p.codigo,
    barras: p.codigoBarras,
    nombre: p.nombre,
    tipo: p.tipo,
    cantidad: p.cantidad,
    foto: fotos.find((f) => f.productoId === p.id)?.archivo ?? null,
    metal: [ley, p.metalDetalle].filter(Boolean).join(" · "),
    pesoNetoMg: p.pesoNetoMg,
    talle: p.talle,
    precio: conPrecio({ p }, ctx).precio.vigente,
    porGramo: p.modoPrecio === "gramo",
  }));
}

/**
 * Consultas de stock: listado con filtros (con el precio de cada pieza calculado a la cotización del día),
 * valuación del stock a costo y a precio, stock bajo, piezas sin movimiento y salidas pendientes.
 */
import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { categorias, db, leyesMetal, productoFotos, productos, salidasPiezas, ubicaciones } from "@/db";
import { leerConfig } from "../config";
import { obtenerVigentes, preciosPorLey } from "../cotizaciones/vigentes";
import { costoPieza, precioPieza, type Cotizaciones } from "./precios";
import { ESTADOS_EN_STOCK } from "./tipos";

export type FiltroStock = {
  q?: string;
  categoriaId?: number;
  tipo?: string;
  estado?: string; // "stock" = todos los que están en el negocio
  ubicacionId?: number;
  leyId?: number;
  artesano?: string;
  stockBajo?: boolean;
  incluirDemo?: boolean;
  pagina?: number;
};
export const POR_PAGINA = 48;

/** Cotizaciones y gramo de venta por ley, una sola vez por pantalla. */
export async function contextoPrecios() {
  const vig = await obtenerVigentes();
  const p = await preciosPorLey(vig);
  const cot: Cotizaciones = { USD: vig[p.referencia].venta, EUR: vig.EUR_OFICIAL.venta };
  const gramo = new Map(p.leyes.map((l) => [l.id, l.precio?.venta ?? null]));
  return { cot, gramo, referencia: p.referencia };
}
export type ContextoPrecios = Awaited<ReturnType<typeof contextoPrecios>>;

function condiciones(f: FiltroStock) {
  const c: SQL[] = [];
  if (f.q?.trim()) {
    const t = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    c.push(sql`(${productos.codigo} like ${t} or ${productos.codigoBarras} like ${t} or ${productos.nombre} like ${t} or ${productos.descripcion} like ${t} or ${productos.coleccion} like ${t} or ${productos.artesano} like ${t})`);
  }
  if (f.categoriaId) c.push(eq(productos.categoriaId, f.categoriaId));
  if (f.tipo) c.push(eq(productos.tipo, f.tipo));
  if (f.ubicacionId) c.push(eq(productos.ubicacionId, f.ubicacionId));
  if (f.leyId) c.push(eq(productos.leyId, f.leyId));
  if (f.artesano) c.push(eq(productos.artesano, f.artesano));
  if (!f.estado || f.estado === "stock") c.push(inArray(productos.estado, ESTADOS_EN_STOCK));
  else if (f.estado !== "todos") c.push(eq(productos.estado, f.estado));
  if (f.stockBajo) c.push(and(inArray(productos.tipo, ["cantidad", "insumo", "packaging"]), sql`${productos.cantidad} <= ${productos.stockMinimo}`, gt(productos.stockMinimo, 0))!);
  return c.length ? and(...c) : undefined;
}

const columnas = {
  p: productos,
  categoria: categorias.nombre,
  ubicacion: ubicaciones.nombre,
  ley: leyesMetal.nombre,
  foto: sql<string | null>`(select archivo from producto_fotos f where f.producto_id = "productos"."id" and f.activa = 1 order by f.orden, f.id limit 1)`,
};

function base() {
  return db
    .select(columnas)
    .from(productos)
    .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
    .leftJoin(ubicaciones, eq(ubicaciones.id, productos.ubicacionId))
    .leftJoin(leyesMetal, eq(leyesMetal.id, productos.leyId));
}

export function conPrecio<T extends { p: typeof productos.$inferSelect }>(fila: T, ctx: ContextoPrecios) {
  const gramo = fila.p.leyId ? (ctx.gramo.get(fila.p.leyId) ?? null) : null;
  return { ...fila, precio: precioPieza(fila.p, gramo, ctx.cot), costo: costoPieza(fila.p, ctx.cot) };
}

export async function listarStock(f: FiltroStock, ctx?: ContextoPrecios, todo = false) {
  const contexto = ctx ?? (await contextoPrecios());
  const where = condiciones(f);
  const pagina = Math.max(1, f.pagina ?? 1);
  const q = base().where(where).orderBy(desc(productos.actualizadoEn), desc(productos.id));
  const filas = todo ? await q.limit(50_000) : await q.limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(productos).where(where);
  return { filas: filas.map((x) => conPrecio(x, contexto)), total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), ctx: contexto };
}

/** Valuación de lo que está en stock (o del filtro): unidades, a costo y a precio, a la cotización del día. */
export async function valuacion(f: FiltroStock, ctx?: ContextoPrecios) {
  const contexto = ctx ?? (await contextoPrecios());
  const filas = await base().where(condiciones(f));
  let unidades = 0;
  let costo = 0;
  let precio = 0;
  let sinPrecio = 0;
  let consignacion = 0;
  for (const x of filas.map((y) => conPrecio(y, contexto))) {
    const u = Math.max(0, x.p.cantidad);
    unidades += u;
    // Lo consignado no es del negocio: no suma a la valuación propia.
    if (x.p.origen === "consignacion") {
      consignacion += u;
      continue;
    }
    costo += (x.costo.enPesos ?? 0) * u;
    if (x.precio.vigente == null) sinPrecio++;
    else precio += x.precio.vigente * u;
  }
  return { piezas: filas.length, unidades, costo, precio, sinPrecio, consignacion };
}

export async function stockBajo() {
  return db
    .select({ id: productos.id, codigo: productos.codigo, nombre: productos.nombre, cantidad: productos.cantidad, minimo: productos.stockMinimo })
    .from(productos)
    .where(and(inArray(productos.tipo, ["cantidad", "insumo", "packaging"]), gt(productos.stockMinimo, 0), sql`${productos.cantidad} <= ${productos.stockMinimo}`, inArray(productos.estado, ESTADOS_EN_STOCK)));
}

/** Piezas disponibles cuyo último movimiento es anterior a X meses. */
export async function sinMovimiento(meses?: number) {
  const m = meses ?? (await leerConfig(["stock.meses_sin_movimiento"]))["stock.meses_sin_movimiento"];
  const limite = Date.now() - m * 30 * 86400_000;
  return db
    .select({ id: productos.id, codigo: productos.codigo, nombre: productos.nombre, ultimo: sql<number>`(select max(fecha) from movimientos_stock m where m.producto_id = "productos"."id")` })
    .from(productos)
    .where(and(eq(productos.estado, "disponible"), sql`(select max(fecha) from movimientos_stock m where m.producto_id = "productos"."id") < ${limite}`));
}

export async function salidasPendientes() {
  return db
    .select({ s: salidasPiezas, codigo: productos.codigo, nombre: productos.nombre, productoId: productos.id })
    .from(salidasPiezas)
    .innerJoin(productos, eq(productos.id, salidasPiezas.productoId))
    .where(isNull(salidasPiezas.devueltaEn))
    .orderBy(asc(salidasPiezas.devolucionEsperada));
}

export async function salidasVencidas() {
  return (await salidasPendientes()).filter((x) => x.s.devolucionEsperada.getTime() < Date.now());
}

/** Valores distintos ya usados (para sugerir al escribir colección y artesano). */
export async function sugerencias() {
  const [cols, arts] = await Promise.all([
    db.selectDistinct({ v: productos.coleccion }).from(productos).where(sql`${productos.coleccion} is not null`).orderBy(asc(productos.coleccion)),
    db.selectDistinct({ v: productos.artesano }).from(productos).where(sql`${productos.artesano} is not null`).orderBy(asc(productos.artesano)),
  ]);
  return { colecciones: cols.map((x) => x.v!), artesanos: arts.map((x) => x.v!) };
}

export async function fotoPrincipal(productoId: number) {
  const [f] = await db.select().from(productoFotos).where(and(eq(productoFotos.productoId, productoId), eq(productoFotos.activa, true))).orderBy(asc(productoFotos.orden), asc(productoFotos.id)).limit(1);
  return f ?? null;
}

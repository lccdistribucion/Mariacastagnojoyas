/**
 * Control de inventario físico: se abre una toma de inventario (de todo el local o de una ubicación), se
 * escanean los códigos (lector de códigos, cámara o tipeando) y al cerrar el sistema compara contra lo que
 * debería estar: FALTANTES (no se leyeron) y SOBRANTES (se leyeron pero no deberían estar ahí).
 * Cerrar NO cambia el stock: los ajustes se hacen después, con motivo y autorización.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, inventarioLecturas, inventarios, productos, ubicaciones } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { buscarPorCodigo } from "./productos";

/** Estados que deberían estar físicamente en el local. */
const EN_EL_LOCAL = ["disponible", "reservado", "senado"];

export async function abrirInventario(nombre: string, ubicacionId: number | null, actor: Actor) {
  if (nombre.trim().length < 3) throw new ErrorValidacion("Poné un nombre a la toma de inventario (por ejemplo «Vitrina — noviembre»).");
  return db.transaction(async (tx) => {
    const [i] = await tx.insert(inventarios).values({ nombre: nombre.trim(), ubicacionId, iniciadoEn: new Date(), usuarioId: actor.id }).returning({ id: inventarios.id });
    await auditar(tx, actor, { accion: "alta", entidad: "inventario", entidadId: i.id, descripcion: `Abrió la toma de inventario «${nombre.trim()}»` });
    return i.id;
  });
}

export async function obtenerInventario(id: number) {
  const [inv] = await db.select().from(inventarios).where(eq(inventarios.id, id));
  if (!inv) return null;
  const lecturas = await db
    .select({ l: inventarioLecturas, nombre: productos.nombre, codigoProducto: productos.codigo })
    .from(inventarioLecturas)
    .leftJoin(productos, eq(productos.id, inventarioLecturas.productoId))
    .where(eq(inventarioLecturas.inventarioId, id))
    .orderBy(desc(inventarioLecturas.id));
  const [ubi] = inv.ubicacionId ? await db.select().from(ubicaciones).where(eq(ubicaciones.id, inv.ubicacionId)) : [];
  return { ...inv, ubicacion: ubi?.nombre ?? null, lecturas };
}

export const listarInventarios = () => db.select().from(inventarios).orderBy(desc(inventarios.iniciadoEn)).limit(50);

/** Registra una lectura. Devuelve qué pieza es (o que el código no existe) y si ya se había leído. */
export async function registrarLectura(inventarioId: number, codigo: string, actor: Actor) {
  const c = codigo.trim().toUpperCase();
  if (!c) throw new ErrorValidacion("Código vacío.");
  const [inv] = await db.select().from(inventarios).where(and(eq(inventarios.id, inventarioId), isNull(inventarios.cerradoEn)));
  if (!inv) throw new ErrorValidacion("Esta toma de inventario ya está cerrada.");
  const p = await buscarPorCodigo(c);
  const repetida = p ? (await db.select({ n: sql<number>`count(*)` }).from(inventarioLecturas).where(and(eq(inventarioLecturas.inventarioId, inventarioId), eq(inventarioLecturas.productoId, p.id))))[0].n : 0;
  await db.insert(inventarioLecturas).values({ inventarioId, codigo: c, productoId: p?.id ?? null, fecha: new Date(), usuarioId: actor.id });
  return {
    codigo: c,
    producto: p ? { id: p.id, codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, estado: p.estado } : null,
    // Una pieza única leída dos veces es un aviso; un artículo por cantidad se cuenta en cada lectura.
    repetida: !!p && p.tipo === "unica" && repetida > 0,
    contadas: repetida + 1,
  };
}

/** Compara lo leído contra lo esperado. */
export async function compararInventario(id: number) {
  const inv = await obtenerInventario(id);
  if (!inv) throw new ErrorValidacion("La toma de inventario no existe.");
  const esperados = await db
    .select()
    .from(productos)
    .where(and(inArray(productos.estado, EN_EL_LOCAL), inv.ubicacionId ? eq(productos.ubicacionId, inv.ubicacionId) : undefined))
    .orderBy(asc(productos.codigo));
  const conteo = new Map<number, number>();
  const desconocidos = new Map<string, number>();
  for (const { l } of inv.lecturas) {
    if (l.productoId) conteo.set(l.productoId, (conteo.get(l.productoId) ?? 0) + 1);
    else desconocidos.set(l.codigo, (desconocidos.get(l.codigo) ?? 0) + 1);
  }
  const idsEsperados = new Set(esperados.map((p) => p.id));
  const faltantes: { id: number; codigo: string; nombre: string; esperado: number; contado: number }[] = [];
  const diferencias: typeof faltantes = [];
  const ok: number[] = [];
  for (const p of esperados) {
    const contado = conteo.get(p.id) ?? 0;
    const esperado = p.tipo === "unica" ? 1 : p.cantidad;
    if (contado === 0 && esperado > 0) faltantes.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, esperado, contado });
    else if (p.tipo !== "unica" && contado !== esperado) diferencias.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, esperado, contado });
    else ok.push(p.id);
  }
  const ajenosIds = [...conteo.keys()].filter((x) => !idsEsperados.has(x));
  const ajenos = ajenosIds.length ? await db.select().from(productos).where(inArray(productos.id, ajenosIds)) : [];
  const sobrantes = [
    ...ajenos.map((p) => ({ codigo: p.codigo, nombre: p.nombre, id: p.id as number | null, motivo: EN_EL_LOCAL.includes(p.estado) ? "Está asignada a otra ubicación" : `En el sistema figura como «${p.estado}»` })),
    ...[...desconocidos.keys()].map((c) => ({ codigo: c, nombre: "—", id: null, motivo: "El código no existe en el sistema" })),
  ];
  return { inventario: inv, esperados: esperados.length, leidos: inv.lecturas.length, correctos: ok.length, faltantes, diferencias, sobrantes };
}

export async function cerrarInventario(id: number, actor: Actor) {
  const r = await compararInventario(id);
  if (r.inventario.cerradoEn) throw new ErrorValidacion("Ya estaba cerrada.");
  const resumen = { esperados: r.esperados, leidos: r.leidos, correctos: r.correctos, faltantes: r.faltantes, diferencias: r.diferencias, sobrantes: r.sobrantes };
  await db.transaction(async (tx) => {
    await tx.update(inventarios).set({ cerradoEn: new Date(), resultado: JSON.stringify(resumen) }).where(eq(inventarios.id, id));
    await auditar(tx, actor, {
      accion: "modificacion",
      entidad: "inventario",
      entidadId: id,
      descripcion: `Cerró la toma de inventario «${r.inventario.nombre}»: ${r.correctos} bien, ${r.faltantes.length} faltantes, ${r.diferencias.length} con diferencia, ${r.sobrantes.length} sobrantes`,
    });
  });
  return resumen;
}

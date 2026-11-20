/**
 * Fotos de las piezas. Se comprimen solas: WebP de hasta 1600 px (para ver en grande) y una miniatura de 400 px
 * (para listados). Quedan en `data/fotos/<pieza>/`. Las fotos no se borran: se ocultan.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, productoFotos, productos } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";

export const CARPETA_FOTOS = process.env.FOTOS_DIR ?? path.join(process.cwd(), "data", "fotos");
export const MAX_FOTOS = 12;
const MAX_BYTES = 25 * 1024 * 1024;

export async function agregarFoto(productoId: number, contenido: Buffer, actor: Actor) {
  if (contenido.length > MAX_BYTES) throw new ErrorValidacion("La foto es demasiado grande (máximo 25 MB).");
  const [p] = await db.select().from(productos).where(eq(productos.id, productoId));
  if (!p) throw new ErrorValidacion("La pieza no existe.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(productoFotos).where(and(eq(productoFotos.productoId, productoId), eq(productoFotos.activa, true)));
  if (n >= MAX_FOTOS) throw new ErrorValidacion(`Cada pieza puede tener hasta ${MAX_FOTOS} fotos.`);
  let grande: { data: Buffer; info: { width: number; height: number } };
  try {
    // rotate(): respeta la orientación con que se sacó la foto en el celular.
    grande = await sharp(contenido, { failOn: "error" }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new ErrorValidacion("El archivo no es una imagen válida (JPG, PNG, WebP o HEIC).");
  }
  const mini = await sharp(grande.data).resize(400, 400, { fit: "inside" }).webp({ quality: 78 }).toBuffer();
  const carpeta = path.join(CARPETA_FOTOS, String(productoId));
  mkdirSync(carpeta, { recursive: true });
  const nombre = randomUUID();
  await sharp(grande.data).toFile(path.join(carpeta, `${nombre}.webp`));
  await sharp(mini).toFile(path.join(carpeta, `${nombre}-mini.webp`));
  await db.transaction(async (tx) => {
    await tx.insert(productoFotos).values({ productoId, archivo: `${productoId}/${nombre}`, orden: n, ancho: grande.info.width, alto: grande.info.height });
    await auditar(tx, actor, { accion: "alta", entidad: "producto", entidadId: productoId, descripcion: `Agregó una foto a ${p.codigo}` });
  });
  return { archivo: `${productoId}/${nombre}`, kb: Math.round(grande.data.length / 1024) };
}

export async function ocultarFoto(fotoId: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [f] = await tx.select().from(productoFotos).where(eq(productoFotos.id, fotoId));
    if (!f) return;
    await tx.update(productoFotos).set({ activa: false }).where(eq(productoFotos.id, fotoId));
    await auditar(tx, actor, { accion: "anulacion", entidad: "producto", entidadId: f.productoId, descripcion: "Quitó una foto de la pieza (se conserva oculta)" });
  });
}

/** Pone una foto como principal (primera). */
export async function fotoPrincipal(fotoId: number) {
  const [f] = await db.select().from(productoFotos).where(eq(productoFotos.id, fotoId));
  if (!f) return;
  const todas = await db.select().from(productoFotos).where(and(eq(productoFotos.productoId, f.productoId), eq(productoFotos.activa, true))).orderBy(asc(productoFotos.orden), asc(productoFotos.id));
  const orden = [f, ...todas.filter((x) => x.id !== f.id)];
  for (const [i, x] of orden.entries()) await db.update(productoFotos).set({ orden: i }).where(eq(productoFotos.id, x.id));
}

/** Lee el archivo de una foto (valida el nombre para que no se pueda pedir otro archivo del disco). */
export async function leerFoto(archivo: string, mini: boolean) {
  if (!/^(\d+|[a-z]+-\d+)\/[0-9a-f-]{36}$/.test(archivo)) return null;
  try {
    return await readFile(path.join(CARPETA_FOTOS, `${archivo}${mini ? "-mini" : ""}.webp`));
  } catch {
    return null;
  }
}

/** Comprime y guarda una imagen en `data/fotos/<carpeta>/` (WebP grande + miniatura). Devuelve «carpeta/nombre». */
export async function guardarImagen(carpeta: string, contenido: Buffer) {
  if (contenido.length > MAX_BYTES) throw new ErrorValidacion("La foto es demasiado grande (máximo 25 MB).");
  let grande: Buffer;
  try {
    grande = await sharp(contenido, { failOn: "error" }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new ErrorValidacion("El archivo no es una imagen válida.");
  }
  const dir = path.join(CARPETA_FOTOS, carpeta);
  mkdirSync(dir, { recursive: true });
  const nombre = randomUUID();
  await sharp(grande).toFile(path.join(dir, `${nombre}.webp`));
  await sharp(grande).resize(400, 400, { fit: "inside" }).webp({ quality: 78 }).toFile(path.join(dir, `${nombre}-mini.webp`));
  return `${carpeta}/${nombre}`;
}

/** Foto en JPEG (para meterla en un PDF). */
export async function fotoJpeg(archivo: string, ancho = 600) {
  const d = await leerFoto(archivo, false);
  return d ? sharp(d).resize(ancho, ancho, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer() : null;
}

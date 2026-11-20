/** Categorías, ubicaciones y listas de precios (configurables por el administrador). */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { categorias, db, listasPrecios, ubicaciones } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";

export const listarCategorias = () => db.select().from(categorias).orderBy(asc(categorias.orden), asc(categorias.nombre));
export const listarUbicaciones = () => db.select().from(ubicaciones).orderBy(asc(ubicaciones.orden), asc(ubicaciones.nombre));
export const listarListas = () => db.select().from(listasPrecios).orderBy(asc(listasPrecios.orden), asc(listasPrecios.id));

const nombre = z.string().trim().min(2, "Escribí un nombre.").max(40);

export async function guardarCategoria(id: number | null, d: { nombre: string; prefijo: string; activo: boolean; orden: number }, actor: Actor) {
  const r = z.object({ nombre, prefijo: z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}$/, "El prefijo va con 2 a 5 letras (ej.: ANI)."), activo: z.boolean(), orden: z.number().int() }).safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  await db.transaction(async (tx) => {
    const [otra] = await tx.select().from(categorias).where(eq(categorias.nombre, r.data.nombre));
    if (otra && otra.id !== id) throw new ErrorValidacion(`Ya existe la categoría «${r.data.nombre}».`);
    if (id) {
      const [antes] = await tx.select().from(categorias).where(eq(categorias.id, id));
      await tx.update(categorias).set(r.data).where(eq(categorias.id, id));
      await auditar(tx, actor, { accion: "modificacion", entidad: "categoria", entidadId: id, descripcion: `Modificó la categoría «${r.data.nombre}»`, antes, despues: r.data });
    } else {
      const [n] = await tx.insert(categorias).values(r.data).returning({ id: categorias.id });
      await auditar(tx, actor, { accion: "alta", entidad: "categoria", entidadId: n.id, descripcion: `Agregó la categoría «${r.data.nombre}»`, despues: r.data });
    }
  });
}

export async function guardarUbicacion(id: number | null, d: { nombre: string; activo: boolean; orden: number }, actor: Actor) {
  const r = z.object({ nombre, activo: z.boolean(), orden: z.number().int() }).safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  await db.transaction(async (tx) => {
    const [otra] = await tx.select().from(ubicaciones).where(eq(ubicaciones.nombre, r.data.nombre));
    if (otra && otra.id !== id) throw new ErrorValidacion(`Ya existe la ubicación «${r.data.nombre}».`);
    if (id) {
      const [antes] = await tx.select().from(ubicaciones).where(eq(ubicaciones.id, id));
      await tx.update(ubicaciones).set(r.data).where(eq(ubicaciones.id, id));
      await auditar(tx, actor, { accion: "modificacion", entidad: "ubicacion", entidadId: id, descripcion: `Modificó la ubicación «${r.data.nombre}»`, antes, despues: r.data });
    } else {
      const [n] = await tx.insert(ubicaciones).values(r.data).returning({ id: ubicaciones.id });
      await auditar(tx, actor, { accion: "alta", entidad: "ubicacion", entidadId: n.id, descripcion: `Agregó la ubicación «${r.data.nombre}»`, despues: r.data });
    }
  });
}

export async function guardarLista(id: number | null, d: { nombre: string; ajustePct: number; activo: boolean; orden: number }, actor: Actor) {
  const r = z.object({ nombre, ajustePct: z.number().int().min(-9000).max(30000), activo: z.boolean(), orden: z.number().int() }).safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  await db.transaction(async (tx) => {
    const [otra] = await tx.select().from(listasPrecios).where(eq(listasPrecios.nombre, r.data.nombre));
    if (otra && otra.id !== id) throw new ErrorValidacion(`Ya existe la lista «${r.data.nombre}».`);
    const ver = (x: { nombre: string; ajustePct: number; activo: boolean }) => ({ Nombre: x.nombre, Ajuste: `${x.ajustePct / 100} %`, Activa: x.activo ? "Sí" : "No" });
    if (id) {
      const [antes] = await tx.select().from(listasPrecios).where(eq(listasPrecios.id, id));
      await tx.update(listasPrecios).set(r.data).where(eq(listasPrecios.id, id));
      await auditar(tx, actor, { accion: "modificacion", entidad: "lista_precios", entidadId: id, descripcion: `Modificó la lista de precios «${r.data.nombre}»`, antes: antes && ver(antes), despues: ver(r.data) });
    } else {
      const [n] = await tx.insert(listasPrecios).values(r.data).returning({ id: listasPrecios.id });
      await auditar(tx, actor, { accion: "alta", entidad: "lista_precios", entidadId: n.id, descripcion: `Agregó la lista de precios «${r.data.nombre}»`, despues: ver(r.data) });
    }
  });
}

export const CATEGORIAS_INICIALES = [
  ["Anillos", "ANI"], ["Alianzas", "ALI"], ["Aros", "ARO"], ["Collares", "COL"], ["Cadenas", "CAD"], ["Pulseras", "PUL"],
  ["Dijes", "DIJ"], ["Relojes", "REL"], ["Accesorios", "ACC"], ["Packaging", "PAC"], ["Insumos", "INS"],
] as const;
export const UBICACIONES_INICIALES = ["Vitrina principal", "Vitrina 2", "Caja fuerte", "Exhibidor", "Taller", "Depósito"];
/** Las listas arrancan en 0 %: los recargos y descuentos los define la dueña. */
export const LISTAS_INICIALES = ["Contado / efectivo", "Tarjeta", "Mayorista"];

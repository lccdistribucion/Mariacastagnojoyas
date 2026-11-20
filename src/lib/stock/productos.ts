/**
 * Alta y edición de piezas y artículos. Cada operación va en una transacción con su movimiento de stock,
 * su historial de precio (si cambió) y su registro de auditoría. Nada se borra: las piezas se dan de baja.
 */
import { and, asc, desc, eq, like, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { categorias, db, historialPrecios, movimientosStock, productoFotos, productoPiedras, productos, salidasPiezas, type Tx } from "@/db";
import { auditar, diferencias, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { ESTADOS, MONEDAS, ORIGENES, TIPOS } from "./tipos";

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const centavos = z.number().int().min(0).max(1e13);

export const esquemaPiedra = z.object({
  tipo: z.string().trim().min(1, "Indicá el tipo de piedra.").max(40),
  cantidad: z.number().int().min(1).max(10000),
  quilates: z.number().int().min(0).max(1_000_000).nullable(),
  calidad: texto(60),
  certificado: texto(80),
});

export const esquemaProducto = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .max(30)
      .regex(/^[A-Z0-9][A-Z0-9._-]*$|^$/, "El código va con letras, números, punto o guion (sin espacios)."),
    codigoBarras: texto(40),
    nombre: z.string().trim().min(2, "Escribí un nombre para la pieza.").max(120),
    tipo: z.enum(Object.keys(TIPOS) as [keyof typeof TIPOS]),
    categoriaId: z.number().int().positive().nullable(),
    coleccion: texto(60),
    artesano: texto(80),
    leyId: z.number().int().positive().nullable(),
    metalDetalle: texto(60),
    pesoBrutoMg: z.number().int().min(0).max(100_000_000).nullable(),
    pesoNetoMg: z.number().int().min(0).max(100_000_000).nullable(),
    medidas: texto(60),
    talle: texto(20),
    descripcion: texto(2000),
    notasInternas: texto(2000),
    costoMetal: centavos,
    costoManoObra: centavos,
    costoPiedras: centavos,
    costoOtros: centavos,
    monedaCosto: z.enum(Object.keys(MONEDAS) as [keyof typeof MONEDAS]),
    modoPrecio: z.enum(["fijo", "gramo"]),
    precioLista: centavos,
    precioOferta: centavos.nullable(),
    monedaPrecio: z.enum(Object.keys(MONEDAS) as [keyof typeof MONEDAS]),
    hechura: centavos,
    ivaPct: z.number().int().refine((v) => [0, 1050, 2100, 2700].includes(v), "Alícuota de IVA no válida."),
    /** Módulo 7: general | bienes_usados | exento (a validar con el contador). */
    tratamientoIva: z.enum(["general", "bienes_usados", "exento"]).default("general"),
    origen: z.enum(Object.keys(ORIGENES) as [keyof typeof ORIGENES]),
    consignante: texto(80),
    proveedorId: z.number().int().positive().nullable().optional(),
    ubicacionId: z.number().int().positive().nullable(),
    cantidad: z.number().int().min(0).max(1_000_000),
    stockMinimo: z.number().int().min(0).max(1_000_000),
    piedras: z.array(esquemaPiedra).max(50).default([]),
  })
  .refine((d) => !(d.pesoBrutoMg && d.pesoNetoMg && d.pesoNetoMg > d.pesoBrutoMg), { message: "El peso neto no puede ser mayor que el bruto." })
  .refine((d) => d.modoPrecio !== "gramo" || (d.leyId && d.pesoNetoMg), { message: "Para precio por gramo hacen falta la ley del metal y el peso neto." })
  .refine((d) => d.modoPrecio !== "fijo" || d.precioLista > 0 || d.tipo === "insumo" || d.tipo === "packaging", { message: "Cargá el precio de lista." })
  .refine((d) => d.precioOferta == null || d.modoPrecio === "gramo" || d.precioOferta < d.precioLista, { message: "La oferta tiene que ser menor que el precio de lista." })
  .refine((d) => d.origen !== "consignacion" || d.consignante || d.proveedorId, { message: "Indicá de quién es la pieza en consignación." });

export type DatosProducto = z.input<typeof esquemaProducto>;

function validar(d: DatosProducto) {
  const r = esquemaProducto.safeParse(d);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const v = r.data;
  // Una pieza única siempre es 1 (no se vende dos veces).
  if (v.tipo === "unica") v.cantidad = 1;
  if (v.modoPrecio === "gramo") v.precioLista = 0;
  return v;
}

/** Próximo código libre de una categoría: ANI-0001, ANI-0002… (o MC-0001 sin categoría). */
export async function siguienteCodigo(categoriaId: number | null, tx: Tx = db) {
  let prefijo = "MC";
  if (categoriaId) {
    const [c] = await tx.select().from(categorias).where(eq(categorias.id, categoriaId));
    if (c) prefijo = c.prefijo;
  }
  const filas = await tx.select({ codigo: productos.codigo }).from(productos).where(like(productos.codigo, `${prefijo}-%`));
  const max = filas.reduce((m, f) => Math.max(m, Number(f.codigo.slice(prefijo.length + 1)) || 0), 0);
  return `${prefijo}-${String(max + 1).padStart(4, "0")}`;
}

/** Vista legible para la auditoría. */
function foto(p: Record<string, unknown>) {
  const pesos = (c: unknown) => (typeof c === "number" ? (c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "—");
  const g = (mg: unknown) => (typeof mg === "number" ? `${(mg / 1000).toLocaleString("es-AR")} g` : "—");
  return {
    Código: p.codigo,
    Nombre: p.nombre,
    Tipo: TIPOS[p.tipo as keyof typeof TIPOS],
    "Categoría (id)": p.categoriaId ?? "—",
    Colección: p.coleccion ?? "—",
    Artesano: p.artesano ?? "—",
    "Ley (id)": p.leyId ?? "—",
    "Metal / terminación": p.metalDetalle ?? "—",
    "Peso bruto": g(p.pesoBrutoMg),
    "Peso neto": g(p.pesoNetoMg),
    Medidas: p.medidas ?? "—",
    Talle: p.talle ?? "—",
    "Costo metal": pesos(p.costoMetal),
    "Costo mano de obra": pesos(p.costoManoObra),
    "Costo piedras": pesos(p.costoPiedras),
    "Costo otros": pesos(p.costoOtros),
    "Moneda del costo": p.monedaCosto,
    "Modo de precio": p.modoPrecio === "gramo" ? "Por gramo" : "Fijo",
    "Precio de lista": pesos(p.precioLista),
    "Precio de oferta": p.precioOferta == null ? "—" : pesos(p.precioOferta),
    "Moneda del precio": p.monedaPrecio,
    Hechura: pesos(p.hechura),
    IVA: `${Number(p.ivaPct) / 100} %`,
    "Tratamiento IVA": p.tratamientoIva === "bienes_usados" ? "Bien usado" : p.tratamientoIva === "exento" ? "Exento" : "General",
    Origen: ORIGENES[p.origen as keyof typeof ORIGENES],
    Consignante: p.consignante ?? "—",
    "Proveedor (id)": p.proveedorId ?? "—",
    "Ubicación (id)": p.ubicacionId ?? "—",
    "Stock mínimo": p.stockMinimo,
  };
}

async function guardarPiedras(tx: Tx, productoId: number, piedras: z.output<typeof esquemaPiedra>[]) {
  // Las piedras son parte de la descripción de la pieza: se reemplazan juntas (el antes queda en auditoría).
  await tx.delete(productoPiedras).where(eq(productoPiedras.productoId, productoId));
  if (piedras.length) await tx.insert(productoPiedras).values(piedras.map((p) => ({ ...p, productoId })));
}

const textoPiedras = (ps: { tipo: string; cantidad: number; quilates: number | null }[]) =>
  ps.length ? ps.map((p) => `${p.cantidad} × ${p.tipo}${p.quilates ? ` ${(p.quilates / 100).toLocaleString("es-AR")} ct` : ""}`).join(", ") : "—";

export async function crearProducto(datos: DatosProducto, actor: Actor, opciones: { esDemo?: boolean; tx?: Tx } = {}) {
  const d = validar(datos);
  const ejecutar = async (tx: Tx) => {
    const codigo = d.codigo || (await siguienteCodigo(d.categoriaId, tx));
    const [repetido] = await tx.select({ id: productos.id }).from(productos).where(eq(productos.codigo, codigo));
    if (repetido) throw new ErrorValidacion(`Ya existe una pieza con el código ${codigo}.`);
    const barras = d.codigoBarras ?? codigo;
    const [barrasRep] = await tx.select({ id: productos.id }).from(productos).where(eq(productos.codigoBarras, barras));
    if (barrasRep) throw new ErrorValidacion(`El código de barras ${barras} ya está en otra pieza.`);
    const { piedras, ...resto } = d;
    const ahora = new Date();
    const [p] = await tx
      .insert(productos)
      .values({ ...resto, codigo, codigoBarras: barras, estado: "disponible", precioActualizadoEn: ahora, esDemo: !!opciones.esDemo, creadoEn: ahora, actualizadoEn: ahora })
      .returning({ id: productos.id });
    await guardarPiedras(tx, p.id, piedras);
    await tx.insert(movimientosStock).values({
      productoId: p.id,
      fecha: ahora,
      tipo: "alta",
      cantidad: d.cantidad,
      stockResultante: d.cantidad,
      estadoDespues: "disponible",
      ubicacionDespues: d.ubicacionId,
      motivo: `Ingreso: ${ORIGENES[d.origen]}`,
      usuarioId: actor.id,
    });
    await tx.insert(historialPrecios).values({ productoId: p.id, fecha: ahora, listaDespues: d.precioLista, ofertaDespues: d.precioOferta, moneda: d.monedaPrecio, motivo: "Alta", usuarioId: actor.id });
    await auditar(tx, actor, {
      accion: "alta",
      entidad: "producto",
      entidadId: p.id,
      descripcion: `Dio de alta ${codigo} · ${d.nombre}${d.cantidad > 1 ? ` (${d.cantidad} u.)` : ""}`,
      despues: { ...foto({ ...resto, codigo }), Piedras: textoPiedras(piedras), Cantidad: d.cantidad },
    });
    return { id: p.id, codigo };
  };
  return opciones.tx ? ejecutar(opciones.tx) : db.transaction(ejecutar);
}

/** Edita los datos de la pieza. La cantidad NO se cambia acá: se cambia con un ajuste (con motivo y autorización). */
export async function editarProducto(id: number, datos: DatosProducto, actor: Actor, motivoPrecio = "Edición") {
  const d = validar(datos);
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(productos).where(eq(productos.id, id));
    if (!antes) throw new ErrorValidacion("La pieza no existe.");
    if (antes.estado === "vendido" || antes.estado === "baja") throw new ErrorValidacion(`La pieza está ${ESTADOS[antes.estado as keyof typeof ESTADOS].toLowerCase()}: no se puede editar.`);
    const codigo = d.codigo || antes.codigo;
    if (codigo !== antes.codigo) {
      const [rep] = await tx.select({ id: productos.id }).from(productos).where(and(eq(productos.codigo, codigo), ne(productos.id, id)));
      if (rep) throw new ErrorValidacion(`Ya existe una pieza con el código ${codigo}.`);
    }
    const barras = d.codigoBarras ?? codigo;
    const [barrasRep] = await tx.select({ id: productos.id }).from(productos).where(and(eq(productos.codigoBarras, barras), ne(productos.id, id)));
    if (barrasRep) throw new ErrorValidacion(`El código de barras ${barras} ya está en otra pieza.`);
    const { piedras, cantidad: _cantidad, ...resto } = d;
    void _cantidad;
    const piedrasAntes = await tx.select().from(productoPiedras).where(eq(productoPiedras.productoId, id));
    const dif = diferencias({ ...foto(antes), Piedras: textoPiedras(piedrasAntes) }, { ...foto({ ...resto, codigo }), Piedras: textoPiedras(piedras) });
    if (!dif.hayCambios) return;
    const cambiaPrecio = antes.precioLista !== d.precioLista || antes.precioOferta !== d.precioOferta || antes.monedaPrecio !== d.monedaPrecio || antes.modoPrecio !== d.modoPrecio || antes.hechura !== d.hechura;
    const ahora = new Date();
    await tx
      .update(productos)
      .set({ ...resto, codigo, codigoBarras: barras, actualizadoEn: ahora, ...(cambiaPrecio ? { precioActualizadoEn: ahora } : {}) })
      .where(eq(productos.id, id));
    await guardarPiedras(tx, id, piedras);
    if (cambiaPrecio)
      await tx.insert(historialPrecios).values({
        productoId: id,
        fecha: ahora,
        listaAntes: antes.precioLista,
        listaDespues: d.precioLista,
        ofertaAntes: antes.precioOferta,
        ofertaDespues: d.precioOferta,
        moneda: d.monedaPrecio,
        motivo: motivoPrecio,
        usuarioId: actor.id,
      });
    if (antes.ubicacionId !== d.ubicacionId)
      await tx.insert(movimientosStock).values({ productoId: id, fecha: ahora, tipo: "ubicacion", ubicacionAntes: antes.ubicacionId, ubicacionDespues: d.ubicacionId, usuarioId: actor.id, stockResultante: antes.cantidad });
    await auditar(tx, actor, {
      accion: "modificacion",
      entidad: "producto",
      entidadId: id,
      descripcion: `Modificó ${codigo} · ${d.nombre} (${Object.keys(dif.despues).join(", ").toLowerCase()})`,
      antes: dif.antes,
      despues: dif.despues,
    });
  });
}

/** Todo lo de una pieza para su ficha. */
export async function obtenerProducto(id: number) {
  const [p] = await db.select().from(productos).where(eq(productos.id, id));
  if (!p) return null;
  const [piedras, fotos, movimientos, precios, salidas] = await Promise.all([
    db.select().from(productoPiedras).where(eq(productoPiedras.productoId, id)),
    db.select().from(productoFotos).where(and(eq(productoFotos.productoId, id), eq(productoFotos.activa, true))).orderBy(asc(productoFotos.orden), asc(productoFotos.id)),
    db.select().from(movimientosStock).where(eq(movimientosStock.productoId, id)).orderBy(desc(movimientosStock.fecha), desc(movimientosStock.id)),
    db.select().from(historialPrecios).where(eq(historialPrecios.productoId, id)).orderBy(desc(historialPrecios.fecha), desc(historialPrecios.id)),
    db.select().from(salidasPiezas).where(eq(salidasPiezas.productoId, id)).orderBy(desc(salidasPiezas.fechaSalida)),
  ]);
  return { ...p, piedras, fotos, movimientos, precios, salidas };
}

export async function buscarPorCodigo(codigo: string) {
  const c = codigo.trim().toUpperCase();
  const [p] = await db
    .select()
    .from(productos)
    .where(sql`upper(${productos.codigo}) = ${c} or upper(${productos.codigoBarras}) = ${c}`);
  return p ?? null;
}

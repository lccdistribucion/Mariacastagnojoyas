/** Acciones del administrador sobre cotizaciones y leyes. Todo queda en auditoría. */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { cotizaciones, cotizacionesEstado, cotizacionesFijas, db, leyesMetal } from "@/db";
import { auditar, diferencias, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { milesimosDeQuilates } from "./calculo";
import { aMicro, CODIGOS, deMicro, lecturaValida, type Codigo } from "./tipos";

const n = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 6 });

/**
 * Carga manual de una cotización. `fijar` = cotización propia del negocio: manda sobre la automática hasta
 * que se quite. Sin fijar = valor del momento (la próxima actualización automática lo reemplaza).
 */
export async function cargarManual(codigo: Codigo, compra: number, venta: number, fijar: boolean, nota: string, actor: Actor) {
  if (!(codigo in CODIGOS)) throw new ErrorValidacion("Cotización desconocida.");
  if (!lecturaValida({ codigo, compra, venta, fechaFuente: null })) throw new ErrorValidacion("Revisá los valores de compra y venta.");
  // Freno contra errores de tipeo (por ejemplo, 1,56 en vez de 1.560): no más de 30 % de diferencia con el último valor.
  const [ultima] = await db.select().from(cotizaciones).where(eq(cotizaciones.codigo, codigo)).orderBy(desc(cotizaciones.fecha)).limit(1);
  if (ultima) {
    const ref = deMicro(ultima.venta);
    if (Math.abs(venta / ref - 1) > 0.3)
      throw new ErrorValidacion(
        `El valor (${n(venta)}) difiere más de 30 % del último guardado (${n(ref)}). Revisá que esté bien escrito: los miles van con punto y los decimales con coma.`,
      );
  }
  const ahora = new Date();
  await db.transaction(async (tx) => {
    if (fijar) {
      const [antes] = await tx.select().from(cotizacionesFijas).where(eq(cotizacionesFijas.codigo, codigo));
      const valores = { compra: aMicro(compra), venta: aMicro(venta), desde: ahora, usuarioId: actor.id ?? 0, nota: nota || null };
      await tx.insert(cotizacionesFijas).values({ codigo, ...valores }).onConflictDoUpdate({ target: cotizacionesFijas.codigo, set: valores });
      await auditar(tx, actor, {
        accion: antes ? "modificacion" : "alta",
        entidad: "cotizacion",
        entidadId: codigo,
        descripcion: `Fijó una cotización propia: ${CODIGOS[codigo].nombre}${nota ? ` (${nota})` : ""}`,
        antes: antes ? { Compra: n(deMicro(antes.compra)), Venta: n(deMicro(antes.venta)) } : undefined,
        despues: { Compra: n(compra), Venta: n(venta) },
      });
    } else {
      await tx.insert(cotizaciones).values({ codigo, compra: aMicro(compra), venta: aMicro(venta), fuente: "manual", origen: "manual", fecha: ahora, fechaFuente: ahora, usuarioId: actor.id, nota: nota || null });
      await tx
        .insert(cotizacionesEstado)
        .values({ codigo, ultimoIntento: ahora, ultimoOk: ahora, fuente: "manual", esRespaldo: false, error: null })
        .onConflictDoUpdate({ target: cotizacionesEstado.codigo, set: { ultimoIntento: ahora, ultimoOk: ahora, fuente: "manual", esRespaldo: false, error: null } });
      await auditar(tx, actor, {
        accion: "alta",
        entidad: "cotizacion",
        entidadId: codigo,
        descripcion: `Cargó a mano: ${CODIGOS[codigo].nombre}${nota ? ` (${nota})` : ""}`,
        despues: { Compra: n(compra), Venta: n(venta) },
      });
    }
  });
}

export async function quitarFija(codigo: Codigo, actor: Actor) {
  await db.transaction(async (tx) => {
    const [antes] = await tx.select().from(cotizacionesFijas).where(eq(cotizacionesFijas.codigo, codigo));
    if (!antes) return;
    await tx.delete(cotizacionesFijas).where(eq(cotizacionesFijas.codigo, codigo));
    await auditar(tx, actor, {
      accion: "anulacion",
      entidad: "cotizacion",
      entidadId: codigo,
      descripcion: `Quitó la cotización propia de ${CODIGOS[codigo].nombre}: vuelve a la automática`,
      antes: { Compra: n(deMicro(antes.compra)), Venta: n(deMicro(antes.venta)) },
    });
  });
}

const esquemaLey = z
  .object({
    nombre: z.string().trim().min(2, "Escribí un nombre (por ejemplo «Oro 18k»).").max(40),
    metal: z.enum(["oro", "plata", "otro"]),
    quilates: z.number().int().min(1).max(24).nullable(),
    milesimos: z.number().int().min(1, "La pureza tiene que ser mayor a 0.").max(1000, "La pureza no puede superar 1000 milésimos.").nullable(),
    ajusteVentaPct: z.number().int().min(-9000).max(50000),
    ajusteCompraPct: z.number().int().min(-9000).max(50000),
    precioManualGramo: z.number().int().min(1).nullable(),
    activo: z.boolean(),
    orden: z.number().int().default(0),
  })
  .transform((d) => ({ ...d, milesimos: d.milesimos ?? (d.metal === "oro" && d.quilates ? milesimosDeQuilates(d.quilates) : null) }))
  .refine((d) => d.milesimos != null, { message: "Indicá los quilates o la pureza en milésimos." })
  .refine((d) => d.metal !== "otro" || d.precioManualGramo != null, { message: "Para otros metales cargá el precio del gramo a mano." });
export type DatosLey = z.input<typeof esquemaLey>;

const fotoLey = (l: { nombre: string; metal: string; quilates: number | null; milesimos: number; ajusteVentaPct: number; ajusteCompraPct: number; precioManualGramo: number | null; activo: boolean }) => ({
  Nombre: l.nombre,
  Metal: l.metal,
  Quilates: l.quilates ?? "—",
  Milésimos: l.milesimos,
  "Ajuste venta": `${l.ajusteVentaPct / 100} %`,
  "Ajuste compra": `${l.ajusteCompraPct / 100} %`,
  "Precio manual /g": l.precioManualGramo == null ? "—" : `$ ${n(l.precioManualGramo / 100)}`,
  Activa: l.activo ? "Sí" : "No",
});

export async function guardarLey(id: number | null, datos: DatosLey, actor: Actor) {
  const r = esquemaLey.safeParse(datos);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const d = { ...r.data, milesimos: r.data.milesimos! };
  return db.transaction(async (tx) => {
    const [mismoNombre] = await tx.select().from(leyesMetal).where(eq(leyesMetal.nombre, d.nombre));
    if (mismoNombre && mismoNombre.id !== id) throw new ErrorValidacion(`Ya existe la ley «${d.nombre}».`);
    if (id) {
      const [antes] = await tx.select().from(leyesMetal).where(eq(leyesMetal.id, id));
      if (!antes) throw new ErrorValidacion("La ley no existe.");
      const dif = diferencias(fotoLey(antes), fotoLey(d));
      if (!dif.hayCambios) return id;
      await tx.update(leyesMetal).set(d).where(eq(leyesMetal.id, id));
      await auditar(tx, actor, { accion: "modificacion", entidad: "ley_metal", entidadId: id, descripcion: `Modificó la ley «${d.nombre}»`, antes: dif.antes, despues: dif.despues });
      return id;
    }
    const [nueva] = await tx.insert(leyesMetal).values(d).returning({ id: leyesMetal.id });
    await auditar(tx, actor, { accion: "alta", entidad: "ley_metal", entidadId: nueva.id, descripcion: `Agregó la ley «${d.nombre}»`, despues: fotoLey(d) });
    return nueva.id;
  });
}

/** Leyes iniciales (se cargan una sola vez si la tabla está vacía). */
export const LEYES_INICIALES: DatosLey[] = [
  { nombre: "Oro 24k", metal: "oro", quilates: 24, milesimos: 1000, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true, orden: 1 },
  { nombre: "Oro 18k", metal: "oro", quilates: 18, milesimos: 750, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true, orden: 2 },
  { nombre: "Oro 14k", metal: "oro", quilates: 14, milesimos: 585, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true, orden: 3 },
  { nombre: "Oro 10k (oro bajo)", metal: "oro", quilates: 10, milesimos: 417, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true, orden: 4 },
  { nombre: "Oro 9k", metal: "oro", quilates: 9, milesimos: 375, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true, orden: 5 },
  { nombre: "Plata 925", metal: "plata", quilates: null, milesimos: 925, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true, orden: 6 },
];

/**
 * Otros materiales sin cotización automática. Se agregan por nombre si faltan (también en bases ya creadas).
 * El precio del gramo arranca en $ 1 y se carga a mano en Configuración → Cotizaciones.
 */
export const LEYES_OTROS_MATERIALES: DatosLey[] = ["Alpaca", "Bronce", "Acero"].map((nombre, i) => ({
  nombre,
  metal: "otro" as const,
  quilates: null,
  milesimos: 1000,
  ajusteVentaPct: 0,
  ajusteCompraPct: 0,
  precioManualGramo: 100,
  activo: true,
  orden: 7 + i,
}));

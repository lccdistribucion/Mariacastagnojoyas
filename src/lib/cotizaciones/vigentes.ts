/**
 * Cotizaciones vigentes: la cotización propia (si el admin fijó una) o el último valor guardado, con su estado
 * para el semáforo. También arma el resumen para la barra superior y la «foto» que guarda cada operación.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import { actualizacionesCotizacion, cotizaciones, cotizacionesEstado, cotizacionesFijas, db, leyesMetal } from "@/db";
import { leerConfig } from "../config";
import { hoyIso } from "../formato";
import { precioGramo, type PrecioGramo } from "./calculo";
import { todosLosConectores } from "./registro";
import { CODIGOS, deMicro, TODOS_LOS_CODIGOS, type Codigo } from "./tipos";

export type Estado = "ok" | "desactualizada" | "fallo" | "propia" | "sin_dato";

export type Vigente = {
  codigo: Codigo;
  nombre: string;
  compra: number | null;
  venta: number | null;
  fuente: string | null;
  fuenteNombre: string | null;
  origen: string | null;
  fecha: number | null;
  fechaFuente: number | null;
  estado: Estado;
  error: string | null;
};

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  ok: "Actualizada hoy",
  desactualizada: "Desactualizada",
  fallo: "Falló la actualización: se usa el último valor",
  propia: "Cotización propia del negocio",
  sin_dato: "Sin datos todavía",
};

const nombreFuente = (id: string | null) =>
  id == null ? null : id === "manual" ? "Carga manual" : id === "propia" ? "Propia del negocio" : (todosLosConectores().find((c) => c.id === id)?.nombre ?? id);

export async function obtenerVigentes(ahora = new Date()): Promise<Record<Codigo, Vigente>> {
  // Último registro de cada código (una sola consulta).
  const ultimos = await db
    .select()
    .from(cotizaciones)
    .where(
      sql`${cotizaciones.id} in (select id from (select id, row_number() over (partition by codigo order by fecha desc, id desc) as n from cotizaciones) where n = 1)`,
    );
  const estados = await db.select().from(cotizacionesEstado);
  const fijas = await db.select().from(cotizacionesFijas);
  const hoy = hoyIso(ahora);
  const out = {} as Record<Codigo, Vigente>;
  for (const codigo of TODOS_LOS_CODIGOS) {
    const fija = fijas.find((f) => f.codigo === codigo);
    const u = ultimos.find((x) => x.codigo === codigo);
    const e = estados.find((x) => x.codigo === codigo);
    const base = { codigo, nombre: CODIGOS[codigo].nombre, error: e?.error ?? null };
    if (fija) {
      out[codigo] = { ...base, compra: deMicro(fija.compra), venta: deMicro(fija.venta), fuente: "propia", fuenteNombre: "Propia del negocio", origen: "propia", fecha: fija.desde.getTime(), fechaFuente: null, estado: "propia" };
      continue;
    }
    if (!u) {
      out[codigo] = { ...base, compra: null, venta: null, fuente: null, fuenteNombre: null, origen: null, fecha: null, fechaFuente: null, estado: "sin_dato" };
      continue;
    }
    const fallo = !!e?.error && (!e.ultimoOk || (e.ultimoIntento?.getTime() ?? 0) > e.ultimoOk.getTime());
    const fechaOk = e?.ultimoOk ?? u.fecha;
    const estado: Estado = fallo ? "fallo" : hoyIso(fechaOk) === hoy ? "ok" : "desactualizada";
    out[codigo] = {
      ...base,
      compra: deMicro(u.compra),
      venta: deMicro(u.venta),
      fuente: u.fuente,
      fuenteNombre: nombreFuente(u.fuente),
      origen: u.origen,
      fecha: fechaOk.getTime(),
      fechaFuente: u.fechaFuente?.getTime() ?? null,
      estado,
    };
  }
  return out;
}

export async function listarLeyes(soloActivas = false) {
  const filas = await db.select().from(leyesMetal).orderBy(asc(leyesMetal.orden), asc(leyesMetal.id));
  return soloActivas ? filas.filter((l) => l.activo) : filas;
}

/** Precio por gramo de cada ley con las cotizaciones vigentes. */
export async function preciosPorLey(vig?: Record<Codigo, Vigente>) {
  const v = vig ?? (await obtenerVigentes());
  const cfg = await leerConfig(["cotizaciones.dolar_referencia", "cotizaciones.ley_oro_bajo"]);
  const dolar = v[cfg["cotizaciones.dolar_referencia"]].venta;
  const leyes = await listarLeyes(true);
  return {
    referencia: cfg["cotizaciones.dolar_referencia"],
    leyOroBajo: cfg["cotizaciones.ley_oro_bajo"],
    leyes: leyes.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      metal: l.metal,
      quilates: l.quilates,
      milesimos: l.milesimos,
      ajusteVentaPct: l.ajusteVentaPct,
      ajusteCompraPct: l.ajusteCompraPct,
      precio: precioGramo(l, { oro: v.XAU.venta, plata: v.XAG.venta }, dolar) as PrecioGramo | null,
      estado: (l.precioManualGramo != null ? "propia" : l.metal === "oro" ? peor(v.XAU.estado, v[cfg["cotizaciones.dolar_referencia"]].estado) : l.metal === "plata" ? peor(v.XAG.estado, v[cfg["cotizaciones.dolar_referencia"]].estado) : "sin_dato") as Estado,
    })),
  };
}

const GRAVEDAD: Record<Estado, number> = { ok: 0, propia: 0, desactualizada: 1, sin_dato: 2, fallo: 3 };
export const peor = (...e: Estado[]) => e.reduce((a, b) => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a), "ok" as Estado);

/** Lo que muestra la barra superior (todo serializable para la pantalla). */
export async function resumenCotizaciones() {
  const v = await obtenerVigentes();
  const p = await preciosPorLey(v);
  const [ultima] = await db.select().from(actualizacionesCotizacion).orderBy(desc(actualizacionesCotizacion.fecha)).limit(1);
  const oro = p.leyes.filter((l) => l.metal === "oro");
  const buscar = (q: number) => oro.find((l) => l.quilates === q && l.precio && !l.precio.manual) ?? oro.find((l) => l.quilates === q);
  const gramos = [
    { etiqueta: "Oro 24k", ley: buscar(24) },
    { etiqueta: "Oro 18k", ley: buscar(18) },
    { etiqueta: "Oro bajo", ley: oro.find((l) => l.id === p.leyOroBajo) },
  ]
    .filter((g) => g.ley)
    .map((g) => ({ etiqueta: g.etiqueta, nombre: g.ley!.nombre, mercado: g.ley!.precio?.mercado ?? null, estado: g.ley!.estado }));
  const dolares = (["USD_BLUE", "USD_OFICIAL", "USD_MEP", "USD_TARJETA", "USD_CCL", "USD_MAYORISTA"] as Codigo[]).map((c) => v[c]);
  return {
    referencia: p.referencia,
    dolares,
    euro: v.EUR_OFICIAL,
    euroBlue: v.EUR_BLUE,
    onzaOro: v.XAU,
    onzaPlata: v.XAG,
    gramos,
    ultimaActualizacion: ultima ? { fecha: ultima.fecha.getTime(), fallidas: ultima.fallidas, conRespaldo: ultima.conRespaldo } : null,
    estadoGeneral: peor(v[p.referencia].estado, v.EUR_OFICIAL.estado, v.XAU.estado),
  };
}
export type ResumenCotizaciones = Awaited<ReturnType<typeof resumenCotizaciones>>;

/**
 * «Foto» de las cotizaciones en este momento. Cada venta, compra y canje la guarda junto con la operación,
 * así los informes históricos quedan bien aunque la cotización cambie después.
 */
export async function fotoCotizaciones() {
  const v = await obtenerVigentes();
  const p = await preciosPorLey(v);
  return {
    fecha: new Date().toISOString(),
    referencia: p.referencia,
    valores: Object.fromEntries(
      Object.values(v)
        .filter((x) => x.venta != null)
        .map((x) => [x.codigo, { compra: x.compra, venta: x.venta, fuente: x.fuente, estado: x.estado }]),
    ),
    gramos: Object.fromEntries(p.leyes.filter((l) => l.precio).map((l) => [l.nombre, { mercado: l.precio!.mercado, venta: l.precio!.venta, compra: l.precio!.compra }])),
  };
}

/** Existe al menos una cotización guardada (si no, al arrancar se trae el historial). */
export async function hayCotizaciones() {
  const [x] = await db.select({ id: cotizaciones.id }).from(cotizaciones).limit(1);
  return !!x;
}

export async function ultimasActualizaciones(n = 15) {
  return db.select().from(actualizacionesCotizacion).orderBy(desc(actualizacionesCotizacion.fecha)).limit(n);
}

export async function estadoDe(codigo: Codigo) {
  const [e] = await db.select().from(cotizacionesEstado).where(eq(cotizacionesEstado.codigo, codigo));
  return e ?? null;
}

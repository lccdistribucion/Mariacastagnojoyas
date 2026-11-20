/**
 * Historial: serie diaria (último valor de cada día, en hora argentina) para los gráficos e informes,
 * e importación del historial público (BCRA y ArgentinaDatos) para no arrancar con los gráficos vacíos.
 */
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { cotizaciones, db } from "@/db";
import { auditar, SISTEMA, type Actor } from "../auditoria";
import { leerConfig } from "../config";
import { hoyIso } from "../formato";
import { CASAS_HISTORIAL, historialArgentinaDatos } from "./conectores/argentinadatos";
import { historialBcra } from "./conectores/bcra";
import { GRAMOS_POR_ONZA, aMicro, deMicro, type Codigo } from "./tipos";

export type Punto = { dia: string; valor: number };

/** Último valor de venta de cada día desde `desde` (aaaa-mm-dd). */
export async function serieDiaria(codigo: Codigo, desde: string): Promise<Punto[]> {
  const dia = sql<string>`date(${cotizaciones.fecha} / 1000, 'unixepoch', '-3 hours')`;
  const filas = await db
    .select({ dia, venta: cotizaciones.venta, fecha: cotizaciones.fecha })
    .from(cotizaciones)
    .where(and(eq(cotizaciones.codigo, codigo), gte(cotizaciones.fecha, new Date(`${desde}T00:00:00-03:00`))))
    .orderBy(asc(cotizaciones.fecha));
  const porDia = new Map<string, number>();
  for (const f of filas) porDia.set(f.dia, deMicro(f.venta)); // queda el último del día
  return [...porDia].map(([d, valor]) => ({ dia: d, valor }));
}

/** Serie del gramo de una ley en pesos: onza × milésimos ÷ 31,1035 × dólar de referencia del mismo día. */
export async function serieGramo(milesimos: number, desde: string): Promise<Punto[]> {
  const cfg = await leerConfig(["cotizaciones.dolar_referencia"]);
  const [oro, dolar] = await Promise.all([serieDiaria("XAU", desde), serieDiaria(cfg["cotizaciones.dolar_referencia"], desde)]);
  const dolarPorDia = new Map(dolar.map((p) => [p.dia, p.valor]));
  let ultimoDolar: number | undefined;
  const out: Punto[] = [];
  // Recorre por fecha usando el último dólar conocido (los fines de semana no hay cotización nueva).
  const dias = [...new Set([...oro.map((p) => p.dia), ...dolar.map((p) => p.dia)])].sort();
  const oroPorDia = new Map(oro.map((p) => [p.dia, p.valor]));
  let ultimoOro: number | undefined;
  for (const d of dias) {
    ultimoDolar = dolarPorDia.get(d) ?? ultimoDolar;
    ultimoOro = oroPorDia.get(d) ?? ultimoOro;
    if (ultimoDolar && ultimoOro && oroPorDia.has(d)) out.push({ dia: d, valor: Math.round((ultimoOro / GRAMOS_POR_ONZA) * (milesimos / 1000) * ultimoDolar * 100) / 100 });
  }
  return out;
}

/** Fecha aaaa-mm-dd de hace `dias` días. */
export const haceDias = (dias: number) => hoyIso(new Date(Date.now() - dias * 86400_000));

/**
 * Trae el historial diario público de los últimos `dias` días. Solo agrega los días que no tienen ningún dato
 * (no pisa nada). Devuelve cuántos registros agregó por cotización.
 */
export async function importarHistorial(dias = 365, actor: Actor = SISTEMA, f: typeof fetch = fetch) {
  const desde = haceDias(dias);
  const hasta = hoyIso();
  const series: { codigo: Codigo; fuente: string; puntos: { fecha: string; compra: number; venta: number }[] }[] = [];
  const errores: string[] = [];

  // Euro: el historial disponible es la referencia diaria del BCRA (muy cercana al oficial de venta).
  for (const [codigo, moneda] of [["USD_BCRA", "USD"], ["EUR_OFICIAL", "EUR"], ["XAU", "XAU"], ["XAG", "XAG"]] as const) {
    try {
      // El BCRA entrega como mucho 1000 filas por pedido: alcanza para varios años de días hábiles.
      const p = await historialBcra(moneda, desde, hasta, f);
      series.push({ codigo, fuente: "bcra", puntos: p.map((x) => ({ fecha: x.fecha, compra: x.valor, venta: x.valor })) });
    } catch (e) {
      errores.push(`BCRA ${moneda}: ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const [codigo, casa] of Object.entries(CASAS_HISTORIAL) as [Codigo, string][]) {
    try {
      const p = await historialArgentinaDatos(casa, f);
      series.push({
        codigo,
        fuente: "argentinadatos",
        puntos: p.filter((x) => x.fecha >= desde && x.venta != null).map((x) => ({ fecha: x.fecha, compra: x.compra ?? x.venta!, venta: x.venta! })),
      });
    } catch (e) {
      errores.push(`ArgentinaDatos ${casa}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const agregados: Record<string, number> = {};
  for (const s of series) {
    const existentes = new Set(
      (
        await db
          .select({ dia: sql<string>`date(${cotizaciones.fecha} / 1000, 'unixepoch', '-3 hours')` })
          .from(cotizaciones)
          .where(and(eq(cotizaciones.codigo, s.codigo), gte(cotizaciones.fecha, new Date(`${desde}T00:00:00-03:00`))))
      ).map((x) => x.dia),
    );
    const nuevos = s.puntos.filter((p) => !existentes.has(p.fecha) && p.fecha < hasta);
    // Lotes de 200 para no armar una consulta gigante.
    for (let i = 0; i < nuevos.length; i += 200) {
      await db.insert(cotizaciones).values(
        nuevos.slice(i, i + 200).map((p) => ({
          codigo: s.codigo,
          compra: aMicro(p.compra),
          venta: aMicro(p.venta),
          fuente: s.fuente,
          origen: "historico",
          fecha: new Date(`${p.fecha}T17:00:00-03:00`),
          fechaFuente: new Date(`${p.fecha}T17:00:00-03:00`),
        })),
      );
    }
    agregados[s.codigo] = (agregados[s.codigo] ?? 0) + nuevos.length;
  }
  const total = Object.values(agregados).reduce((a, b) => a + b, 0);
  await db.transaction(async (tx) =>
    auditar(tx, actor, {
      accion: "alta",
      entidad: "cotizacion",
      descripcion: `Importó el historial de cotizaciones de los últimos ${dias} días (${total} valores diarios)${errores.length ? `; sin respuesta: ${errores.length} series` : ""}`,
    }),
  );
  return { agregados, total, errores };
}

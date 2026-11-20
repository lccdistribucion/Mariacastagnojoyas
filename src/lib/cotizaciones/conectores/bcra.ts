import { z } from "zod";
import type { Conector, Lectura } from "../tipos";
import { fechaODefecto, pedirJson } from "./http";

/**
 * API oficial del BCRA (Estadísticas Cambiarias v1.0) — gratis, sin clave. Publica una vez por día hábil:
 * dólar de referencia (Com. A 3500) y la onza de oro y de plata en dólares. Sirve de respaldo para los metales
 * y para traer el historial.
 */
const det = z.object({ codigoMoneda: z.string(), tipoPase: z.number(), tipoCotizacion: z.number() });
const resp = z.object({ results: z.union([z.object({ fecha: z.string(), detalle: z.array(det) }), z.array(z.object({ fecha: z.string(), detalle: z.array(det) }))]) });

export const bcra: Conector = {
  id: "bcra",
  nombre: "BCRA (oficial)",
  sitio: "bcra.gob.ar",
  codigos: ["USD_BCRA", "XAU", "XAG"],
  gratis: true,
  requiereClave: false,
  limites: "Oficial y gratuita; un valor por día hábil (al cierre).",
  async obtener(f) {
    const d = resp.parse(await pedirJson("https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones", f, 15_000));
    const r = Array.isArray(d.results) ? d.results[0] : d.results;
    const fecha = fechaODefecto(r.fecha);
    const out: Lectura[] = [];
    for (const x of r.detalle) {
      if (x.codigoMoneda === "USD" && x.tipoCotizacion > 0) out.push({ codigo: "USD_BCRA", compra: x.tipoCotizacion, venta: x.tipoCotizacion, fechaFuente: fecha });
      if (x.codigoMoneda === "XAU" && x.tipoPase > 0) out.push({ codigo: "XAU", compra: x.tipoPase, venta: x.tipoPase, fechaFuente: fecha });
      if (x.codigoMoneda === "XAG" && x.tipoPase > 0) out.push({ codigo: "XAG", compra: x.tipoPase, venta: x.tipoPase, fechaFuente: fecha });
    }
    return out;
  },
};

/** Serie histórica diaria de una moneda del BCRA (USD, XAU, XAG) entre dos fechas aaaa-mm-dd. */
export async function historialBcra(moneda: "USD" | "EUR" | "XAU" | "XAG", desde: string, hasta: string, f: typeof fetch = fetch) {
  const url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/${moneda}?fechadesde=${desde}&fechahasta=${hasta}&limit=1000`;
  const d = z.object({ results: z.array(z.object({ fecha: z.string(), detalle: z.array(det) })) }).parse(await pedirJson(url, f, 30_000));
  return d.results
    .map((r) => {
      const x = r.detalle[0];
      const valor = moneda === "USD" || moneda === "EUR" ? x?.tipoCotizacion : x?.tipoPase;
      return { fecha: r.fecha, valor: valor ?? 0 };
    })
    .filter((r) => r.valor > 0);
}

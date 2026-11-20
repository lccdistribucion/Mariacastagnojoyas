import { z } from "zod";
import type { Codigo, Conector, Lectura } from "../tipos";
import { fechaODefecto, pedirJson } from "./http";

/** DolarApi.com — gratis, sin clave. Todos los tipos de dólar y el euro oficial. */
const CASAS: Record<string, Codigo> = {
  oficial: "USD_OFICIAL",
  blue: "USD_BLUE",
  bolsa: "USD_MEP",
  contadoconliqui: "USD_CCL",
  tarjeta: "USD_TARJETA",
  mayorista: "USD_MAYORISTA",
};
const fila = z.object({ moneda: z.string(), casa: z.string(), compra: z.number().nullable(), venta: z.number().nullable(), fechaActualizacion: z.string().optional() });

export const dolarapi: Conector = {
  id: "dolarapi",
  nombre: "DolarApi",
  sitio: "dolarapi.com",
  codigos: [...Object.values(CASAS), "EUR_OFICIAL"],
  gratis: true,
  requiereClave: false,
  limites: "Sin límite publicado; se consulta como mucho cada 15 minutos.",
  async obtener(f) {
    const [dolares, monedas] = await Promise.all([
      pedirJson("https://dolarapi.com/v1/dolares", f),
      pedirJson("https://dolarapi.com/v1/cotizaciones", f),
    ]);
    const out: Lectura[] = [];
    for (const d of z.array(fila).parse(dolares)) {
      const codigo = CASAS[d.casa];
      if (codigo && d.compra != null && d.venta != null) out.push({ codigo, compra: d.compra, venta: d.venta, fechaFuente: fechaODefecto(d.fechaActualizacion) });
    }
    const eur = z.array(fila).parse(monedas).find((m) => m.moneda === "EUR");
    if (eur?.compra != null && eur.venta != null) out.push({ codigo: "EUR_OFICIAL", compra: eur.compra, venta: eur.venta, fechaFuente: fechaODefecto(eur.fechaActualizacion) });
    return out;
  },
};

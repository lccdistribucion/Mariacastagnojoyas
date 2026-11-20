import { z } from "zod";
import type { Conector } from "../tipos";
import { fechaODefecto, pedirJson } from "./http";

/** Bluelytics — gratis, sin clave. Dólar y euro, oficial y blue. */
const par = z.object({ value_buy: z.number(), value_sell: z.number() });
const esquema = z.object({ oficial: par, blue: par, oficial_euro: par, blue_euro: par, last_update: z.string() });

export const bluelytics: Conector = {
  id: "bluelytics",
  nombre: "Bluelytics",
  sitio: "bluelytics.com.ar",
  codigos: ["USD_OFICIAL", "USD_BLUE", "EUR_OFICIAL", "EUR_BLUE"],
  gratis: true,
  requiereClave: false,
  limites: "Sin límite publicado; uso razonable.",
  async obtener(f) {
    const d = esquema.parse(await pedirJson("https://api.bluelytics.com.ar/v2/latest", f));
    const fecha = fechaODefecto(d.last_update);
    return [
      { codigo: "USD_OFICIAL", compra: d.oficial.value_buy, venta: d.oficial.value_sell, fechaFuente: fecha },
      { codigo: "USD_BLUE", compra: d.blue.value_buy, venta: d.blue.value_sell, fechaFuente: fecha },
      { codigo: "EUR_OFICIAL", compra: d.oficial_euro.value_buy, venta: d.oficial_euro.value_sell, fechaFuente: fecha },
      { codigo: "EUR_BLUE", compra: d.blue_euro.value_buy, venta: d.blue_euro.value_sell, fechaFuente: fecha },
    ];
  },
};

import { z } from "zod";
import type { Conector } from "../tipos";
import { fechaODefecto, pedirJson } from "./http";

/** gold-api.com — gratis, sin clave. Onza de oro (XAU) y de plata (XAG) en dólares, mercado internacional. */
const esquema = z.object({ price: z.number(), symbol: z.string(), updatedAt: z.string().optional() });

export const goldapi: Conector = {
  id: "goldapi",
  nombre: "Gold API",
  sitio: "gold-api.com",
  codigos: ["XAU", "XAG"],
  gratis: true,
  requiereClave: false,
  limites: "Sin clave ni límite publicado; precio spot casi en tiempo real.",
  async obtener(f) {
    const [oro, plata] = await Promise.all([
      pedirJson("https://api.gold-api.com/price/XAU", f).then((x) => esquema.parse(x)),
      pedirJson("https://api.gold-api.com/price/XAG", f).then((x) => esquema.parse(x)),
    ]);
    return [
      { codigo: "XAU", compra: oro.price, venta: oro.price, fechaFuente: fechaODefecto(oro.updatedAt) },
      { codigo: "XAG", compra: plata.price, venta: plata.price, fechaFuente: fechaODefecto(plata.updatedAt) },
    ];
  },
};

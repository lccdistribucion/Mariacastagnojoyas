import { z } from "zod";
import type { Conector, Lectura } from "../tipos";
import { fechaODefecto, pedirJson } from "./http";

/** CriptoYa — gratis, sin clave. Oficial, blue, MEP, CCL, tarjeta y mayorista. */
const puntaPunta = z.object({ ask: z.number(), bid: z.number(), timestamp: z.number().optional() });
const precio = z.object({ price: z.number(), timestamp: z.number().optional() });
const bono = z.object({ al30: z.object({ ci: precio }) });
const esquema = z.object({
  oficial: puntaPunta,
  blue: puntaPunta,
  tarjeta: precio,
  mayorista: precio,
  mep: bono,
  ccl: bono,
});

export const criptoya: Conector = {
  id: "criptoya",
  nombre: "CriptoYa",
  sitio: "criptoya.com",
  codigos: ["USD_OFICIAL", "USD_BLUE", "USD_MEP", "USD_CCL", "USD_TARJETA", "USD_MAYORISTA"],
  gratis: true,
  requiereClave: false,
  limites: "Sin límite publicado; uso razonable.",
  async obtener(f) {
    const d = esquema.parse(await pedirJson("https://criptoya.com/api/dolar", f));
    const pp = (p: z.infer<typeof puntaPunta>) => ({ compra: p.bid, venta: p.ask, fechaFuente: fechaODefecto(p.timestamp) });
    const un = (p: z.infer<typeof precio>) => ({ compra: p.price, venta: p.price, fechaFuente: fechaODefecto(p.timestamp) });
    const out: Lectura[] = [
      { codigo: "USD_OFICIAL", ...pp(d.oficial) },
      { codigo: "USD_BLUE", ...pp(d.blue) },
      { codigo: "USD_TARJETA", ...un(d.tarjeta) },
      { codigo: "USD_MAYORISTA", ...un(d.mayorista) },
      { codigo: "USD_MEP", ...un(d.mep.al30.ci) },
      { codigo: "USD_CCL", ...un(d.ccl.al30.ci) },
    ];
    return out;
  },
};

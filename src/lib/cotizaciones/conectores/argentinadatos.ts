import { z } from "zod";
import { pedirJson } from "./http";

/**
 * ArgentinaDatos — gratis, sin clave. Solo se usa para TRAER EL HISTORIAL diario de los dólares que el BCRA
 * no publica (blue, MEP, tarjeta) y del oficial minorista. No participa de la actualización del día.
 */
export const CASAS_HISTORIAL = { USD_BLUE: "blue", USD_OFICIAL: "oficial", USD_MEP: "bolsa", USD_TARJETA: "tarjeta" } as const;

export async function historialArgentinaDatos(casa: string, f: typeof fetch = fetch) {
  const d = await pedirJson(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}`, f, 30_000);
  return z.array(z.object({ compra: z.number().nullable(), venta: z.number().nullable(), fecha: z.string() })).parse(d);
}

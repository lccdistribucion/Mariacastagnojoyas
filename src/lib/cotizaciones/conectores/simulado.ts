/**
 * Fuentes SIMULADAS para las pruebas automáticas (se activan con COTIZACIONES_SIMULADAS=1; nunca en uso real).
 * Imitan a las fuentes reales con valores fijos. Con `data/simulacion-cotizaciones.json` se puede pedir que
 * alguna falle ({"fallan": ["dolarapi"]}) o que los valores varíen ({"factor": 1.05}).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Codigo, Conector, Lectura } from "../tipos";
import { bcra } from "./bcra";
import { bluelytics } from "./bluelytics";
import { criptoya } from "./criptoya";
import { dolarapi } from "./dolarapi";
import { goldapi } from "./goldapi";

const BASE: Record<Codigo, [number, number]> = {
  USD_OFICIAL: [1525, 1575],
  USD_BLUE: [1585, 1605],
  USD_MEP: [1591.5, 1603.3],
  USD_CCL: [1694.2, 1697.2],
  USD_TARJETA: [1982.5, 2047.5],
  USD_MAYORISTA: [1543, 1552],
  USD_BCRA: [1552, 1552],
  EUR_OFICIAL: [1699, 1712.79],
  EUR_BLUE: [1708, 1745],
  XAU: [3846.6, 3846.6],
  XAG: [47.1, 47.1],
};

function control(): { fallan?: string[]; factor?: number } {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "data", "simulacion-cotizaciones.json"), "utf8"));
  } catch {
    return {};
  }
}

function simular(real: Conector): Conector {
  return {
    ...real,
    nombre: `${real.nombre} (simulado)`,
    async obtener() {
      const c = control();
      if (c.fallan?.includes(real.id)) throw new Error("sin respuesta (simulado)");
      const f = c.factor ?? 1;
      return real.codigos.map((codigo): Lectura => ({ codigo, compra: BASE[codigo][0] * f, venta: BASE[codigo][1] * f, fechaFuente: new Date() }));
    },
  };
}

export const SIMULADOS = [dolarapi, criptoya, bluelytics, goldapi, bcra].map(simular);

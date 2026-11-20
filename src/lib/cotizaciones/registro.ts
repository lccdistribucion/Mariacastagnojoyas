/**
 * Registro de fuentes. Para cambiar de proveedor: escribir un conector en `conectores/` y agregarlo acá.
 * El orden y cuáles están activas lo decide el administrador en Configuración → Cotizaciones.
 */
import { bcra } from "./conectores/bcra";
import { bluelytics } from "./conectores/bluelytics";
import { criptoya } from "./conectores/criptoya";
import { dolarapi } from "./conectores/dolarapi";
import { goldapi } from "./conectores/goldapi";
import { SIMULADOS } from "./conectores/simulado";
import type { Conector } from "./tipos";

const REALES: Conector[] = [dolarapi, criptoya, bluelytics, goldapi, bcra];

export function todosLosConectores(): Conector[] {
  return process.env.COTIZACIONES_SIMULADAS === "1" ? SIMULADOS : REALES;
}

/** Conectores activos en el orden elegido (los nuevos que no estén en la configuración van al final, activos). */
export function conectoresOrdenados(orden: { id: string; activo: boolean }[]): Conector[] {
  const todos = todosLosConectores();
  const out: Conector[] = [];
  for (const o of orden) {
    const c = todos.find((x) => x.id === o.id);
    if (c && o.activo) out.push(c);
  }
  for (const c of todos) if (!orden.some((o) => o.id === c.id)) out.push(c);
  return out;
}

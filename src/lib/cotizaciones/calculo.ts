/**
 * Cálculo del precio del gramo por ley. Sin base de datos: se prueba solo.
 *   gramo 24k en USD = onza ÷ 31,1035
 *   gramo de una ley = gramo 24k × milésimos ÷ 1000   (18k = 750 ‰ = 75 %)
 *   en pesos         = gramo en USD × dólar de referencia (venta)
 *   precio de venta  = mercado × (1 + ajuste de venta)   ·   precio de compra (oro usado) = mercado × (1 + ajuste de compra)
 */
import { GRAMOS_POR_ONZA } from "./tipos";

export type LeyParaCalculo = {
  metal: string;
  milesimos: number;
  ajusteVentaPct: number; // centésimos de punto
  ajusteCompraPct: number;
  precioManualGramo: number | null; // centavos
};

export type PrecioGramo = { usd: number | null; mercado: number; venta: number; compra: number; manual: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Milésimos de una ley de oro a partir de los quilates (18k → 750). */
export const milesimosDeQuilates = (q: number) => Math.round((q / 24) * 1000);

export function precioGramo(ley: LeyParaCalculo, onzaUsd: { oro: number | null; plata: number | null }, dolar: number | null): PrecioGramo | null {
  const ajustar = (base: number) => ({
    venta: r2(base * (1 + ley.ajusteVentaPct / 10000)),
    compra: r2(base * (1 + ley.ajusteCompraPct / 10000)),
  });
  if (ley.precioManualGramo != null) {
    const base = ley.precioManualGramo / 100;
    return { usd: null, mercado: r2(base), ...ajustar(base), manual: true };
  }
  const onza = ley.metal === "oro" ? onzaUsd.oro : ley.metal === "plata" ? onzaUsd.plata : null;
  if (onza == null || dolar == null) return null;
  const usd = (onza / GRAMOS_POR_ONZA) * (ley.milesimos / 1000);
  const mercado = usd * dolar;
  return { usd: Math.round(usd * 10000) / 10000, mercado: r2(mercado), ...ajustar(mercado), manual: false };
}

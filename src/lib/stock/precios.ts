/**
 * Precio y costo de una pieza en pesos, con las cotizaciones del momento. Sin base de datos (se prueba solo).
 * - Precio fijo: precio de lista (u oferta) en su moneda → pesos con el dólar de referencia o el euro oficial.
 * - Precio por gramo: peso neto × precio de venta del gramo de su ley + hechura. Se recalcula solo cuando cambia
 *   la cotización del oro o del dólar.
 */
export type Cotizaciones = { USD: number | null; EUR: number | null };

export type DatosPrecio = {
  modoPrecio: string;
  precioLista: number;
  precioOferta: number | null;
  monedaPrecio: string;
  hechura: number;
  pesoNetoMg: number | null;
  costoMetal: number;
  costoManoObra: number;
  costoPiedras: number;
  costoOtros: number;
  monedaCosto: string;
};

/** Centavos en `moneda` → centavos de pesos (null si falta la cotización). */
export function aPesos(centavos: number, moneda: string, cot: Cotizaciones): number | null {
  if (moneda === "ARS") return centavos;
  const tc = moneda === "USD" ? cot.USD : moneda === "EUR" ? cot.EUR : null;
  return tc == null ? null : Math.round(centavos * tc);
}

export type Precio = {
  /** Centavos de pesos. null = no se puede calcular (falta cotización o ley). */
  lista: number | null;
  oferta: number | null;
  /** El que se cobra: oferta si hay, si no lista. */
  vigente: number | null;
  porGramo: boolean;
  detalle: string;
};

export function precioPieza(p: DatosPrecio, gramoVenta: number | null, cot: Cotizaciones): Precio {
  const oferta = p.precioOferta != null ? aPesos(p.precioOferta, p.monedaPrecio, cot) : null;
  if (p.modoPrecio === "gramo") {
    if (gramoVenta == null || !p.pesoNetoMg) return { lista: null, oferta, vigente: oferta, porGramo: true, detalle: "Falta el peso neto o la cotización de la ley" };
    const gramos = p.pesoNetoMg / 1000;
    // Se redondea a pesos enteros: es lo que se cobra en el mostrador.
    const lista = Math.round(gramos * gramoVenta + p.hechura / 100) * 100;
    return {
      lista,
      oferta,
      vigente: oferta ?? lista,
      porGramo: true,
      detalle: `${gramos.toLocaleString("es-AR", { maximumFractionDigits: 3 })} g × $ ${gramoVenta.toLocaleString("es-AR", { maximumFractionDigits: 0 })}${p.hechura ? ` + hechura $ ${(p.hechura / 100).toLocaleString("es-AR")}` : ""}`,
    };
  }
  const lista = aPesos(p.precioLista, p.monedaPrecio, cot);
  return {
    lista,
    oferta,
    vigente: oferta ?? lista,
    porGramo: false,
    detalle: p.monedaPrecio === "ARS" ? "Precio fijo" : `US$/€ ${(p.precioLista / 100).toLocaleString("es-AR")} a la cotización del día`,
  };
}

export function costoPieza(p: DatosPrecio, cot: Cotizaciones) {
  const total = p.costoMetal + p.costoManoObra + p.costoPiedras + p.costoOtros;
  return { total, enPesos: aPesos(total, p.monedaCosto, cot) };
}

/** Precio de una lista (contado, tarjeta…) a partir del vigente: ajuste en centésimos de punto, a pesos enteros. */
export const precioConLista = (vigente: number, ajustePct: number) => Math.round((vigente * (1 + ajustePct / 10000)) / 100) * 100;

/** Redondeo para actualizaciones masivas: 0 = sin redondeo; si no, a múltiplos de `a` pesos (hacia arriba). */
export const redondear = (centavos: number, a: number) => (a > 0 ? Math.ceil(centavos / (a * 100)) * a * 100 : Math.round(centavos));

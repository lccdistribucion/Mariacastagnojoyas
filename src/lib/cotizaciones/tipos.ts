/**
 * Catálogo de cotizaciones que maneja el sistema. Monedas: pesos por unidad. Metales: dólares por onza troy.
 * Este archivo no toca la base: lo usan el servidor, la pantalla y las pruebas.
 */
export const CODIGOS = {
  USD_OFICIAL: { nombre: "Dólar oficial", corto: "Oficial", tipo: "moneda", moneda: "USD" },
  USD_BLUE: { nombre: "Dólar blue", corto: "Blue", tipo: "moneda", moneda: "USD" },
  USD_MEP: { nombre: "Dólar MEP", corto: "MEP", tipo: "moneda", moneda: "USD" },
  USD_CCL: { nombre: "Dólar contado con liqui", corto: "CCL", tipo: "moneda", moneda: "USD" },
  USD_TARJETA: { nombre: "Dólar tarjeta", corto: "Tarjeta", tipo: "moneda", moneda: "USD" },
  USD_MAYORISTA: { nombre: "Dólar mayorista", corto: "Mayorista", tipo: "moneda", moneda: "USD" },
  USD_BCRA: { nombre: "Dólar referencia BCRA (A3500)", corto: "BCRA", tipo: "moneda", moneda: "USD" },
  EUR_OFICIAL: { nombre: "Euro oficial", corto: "Oficial", tipo: "moneda", moneda: "EUR" },
  EUR_BLUE: { nombre: "Euro blue", corto: "Blue", tipo: "moneda", moneda: "EUR" },
  XAU: { nombre: "Oro — onza troy (USD)", corto: "Onza oro", tipo: "metal", moneda: "USD" },
  XAG: { nombre: "Plata — onza troy (USD)", corto: "Onza plata", tipo: "metal", moneda: "USD" },
} as const;

export type Codigo = keyof typeof CODIGOS;
export const TODOS_LOS_CODIGOS = Object.keys(CODIGOS) as Codigo[];

/** Dólares que se pueden elegir como referencia del negocio (para convertir el oro a pesos). */
export const DOLARES_REFERENCIA = ["USD_BLUE", "USD_OFICIAL", "USD_MEP", "USD_TARJETA", "USD_CCL"] as const;
export type DolarReferencia = (typeof DOLARES_REFERENCIA)[number];

/** Gramos de una onza troy. */
export const GRAMOS_POR_ONZA = 31.1035;

/** Lo que devuelve una fuente para una cotización. */
export type Lectura = { codigo: Codigo; compra: number; venta: number; fechaFuente: Date | null };

/**
 * Un conector es una fuente de datos intercambiable. Para sumar o cambiar una fuente se escribe un conector
 * nuevo (ver `conectores/`) y se lo registra en `registro.ts`: el resto del sistema no cambia.
 */
export type Conector = {
  id: string;
  nombre: string;
  sitio: string;
  /** Qué cotizaciones puede dar. */
  codigos: readonly Codigo[];
  gratis: boolean;
  requiereClave: boolean;
  limites: string;
  obtener: (fetchFn?: typeof fetch) => Promise<Lectura[]>;
};

/** Millonésimos ↔ número (las cotizaciones se guardan como enteros). */
export const aMicro = (n: number) => Math.round(n * 1_000_000);
export const deMicro = (n: number) => n / 1_000_000;

/** Rangos razonables: si una fuente devuelve algo fuera de esto, se descarta (dato roto, no se usa). */
export const RANGOS: Record<"moneda" | "metal", [number, number]> = {
  moneda: [1, 1_000_000],
  metal: [1, 1_000_000],
};
export function lecturaValida(l: Lectura) {
  const [min, max] = RANGOS[CODIGOS[l.codigo].tipo];
  return (
    Number.isFinite(l.compra) && Number.isFinite(l.venta) && l.compra >= min && l.venta >= min && l.compra <= max && l.venta <= max && l.venta >= l.compra * 0.5 && l.venta <= l.compra * 2
  );
}

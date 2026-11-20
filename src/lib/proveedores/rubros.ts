/** Rubros de proveedores (sin base de datos: se usa también en el navegador). */
export const RUBROS = {
  fabricante: "Fabricante",
  mayorista: "Mayorista",
  artesano: "Artesano / diseñador",
  fundidor: "Fundidor",
  taller: "Taller",
  piedras: "Piedras",
  insumos: "Insumos y packaging",
  relojes: "Relojes",
  revendedor: "Revendedor / feria (le entregamos piezas)",
} as const;
export type Rubro = keyof typeof RUBROS;

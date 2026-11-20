/**
 * Exportación genérica de listados a Excel y PDF. Cada listado del sistema define sus columnas una vez
 * y obtiene las dos salidas con el mismo formato argentino.
 */
export type Columna<T> = {
  titulo: string;
  valor: (fila: T) => string | number | Date | null | undefined;
  /** Ancho relativo (Excel: caracteres; PDF: proporción). */
  ancho?: number;
  alinear?: "izq" | "der";
  /** Formato numérico de Excel (por ejemplo '#,##0.00'). */
  formatoExcel?: string;
};

export type Listado<T> = {
  titulo: string;
  subtitulo?: string;
  columnas: Columna<T>[];
  filas: T[];
};

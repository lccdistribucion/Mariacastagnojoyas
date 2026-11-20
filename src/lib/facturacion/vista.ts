/** Textos para mostrar el resultado de una emisión (sin base de datos). */
import { NOMBRE_TIPO, numeroComprobante } from "./calculo";

type C = { estado: string; tipo: number; puntoVenta: number; numero: number | null; cae: string | null; errores: string | null; ambiente: string };
export type ResultadoFiscal = { ok?: string; error?: string; aviso?: string };

export function resultadoFiscal(c: C): ResultadoFiscal {
  const nombre = `${NOMBRE_TIPO[c.tipo]} ${numeroComprobante(c.puntoVenta, c.numero)}`;
  if (c.estado === "autorizado") return { ok: `${nombre} autorizada${c.ambiente === "simulado" ? " (simulada, sin validez fiscal)" : ""}. CAE ${c.cae}.` };
  if (c.estado === "rechazado") return { error: `ARCA rechazó la ${NOMBRE_TIPO[c.tipo].toLowerCase()}: ${c.errores}` };
  return { aviso: `La ${NOMBRE_TIPO[c.tipo].toLowerCase()} quedó pendiente (${c.errores}). Se reintenta sola; también podés reintentarla desde Facturación → Pendientes.` };
}

/** Textos cortos para mostrar una pieza (sin base de datos). */
import { numero } from "../formato";

export const gramos = (mg: number | null | undefined) => (mg == null ? null : `${numero(mg / 1000, mg % 1000 === 0 ? 0 : mg % 100 === 0 ? 1 : 2)} g`);

export function resumenMetal(p: { metalDetalle: string | null; pesoNetoMg: number | null }, ley: string | null) {
  return [ley?.replace(" (oro bajo)", ""), p.metalDetalle, gramos(p.pesoNetoMg)].filter(Boolean).join(" · ");
}

export const TONO_ESTADO: Record<string, "ok" | "alerta" | "error" | "neutro" | "champagne" | "oscuro"> = {
  disponible: "ok",
  reservado: "champagne",
  senado: "champagne",
  vendido: "oscuro",
  reparacion: "alerta",
  taller: "alerta",
  consignacion_afuera: "alerta",
  afuera: "alerta",
  baja: "error",
  devuelto: "neutro",
};

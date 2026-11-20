/** Lee del formulario los campos del componente «OrigenPago» (sin base de datos). */
import { ErrorValidacion } from "../config";
import { leerNumero } from "../formato";

export function leerOrigenPago(f: FormData) {
  const t = (k: string) => String(f.get(k) ?? "").trim();
  const medio = t("medio");
  const cajaId = Number(t("cajaId")) || null;
  let chequeTerceroId: number | null = null;
  let chequePropio: { numero: string; bancoCajaId: number; fechaPago: Date } | null = null;
  let metal: { leyId: number; pesoMg: number } | null = null;
  if (medio === "cheque") {
    if (t("chequeModo") === "tercero") chequeTerceroId = Number(t("chequeTerceroId")) || null;
    else {
      if (!t("chequeFechaPago")) throw new ErrorValidacion("Indicá la fecha de pago del cheque.");
      chequePropio = { numero: t("chequeNumero"), bancoCajaId: Number(t("chequeBancoId")), fechaPago: new Date(`${t("chequeFechaPago")}T12:00:00-03:00`) };
    }
  }
  if (medio === "metal") metal = { leyId: Number(t("metalLeyId")), pesoMg: Math.round((leerNumero(t("metalGramos")) ?? 0) * 1000) };
  return { medio, cajaId: ["transferencia", "efectivo", "tarjeta", "otro"].includes(medio) ? cajaId : null, chequeTerceroId, chequePropio, metal, exigirCaja: true };
}

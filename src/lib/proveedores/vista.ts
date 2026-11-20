import { numero } from "../formato";

/** «Le debemos $ 120.000 · Nos debe USD 50,00» */
export const saldoTexto = (s: Record<string, number>) =>
  Object.entries(s)
    .map(([m, v]) => `${v > 0 ? "Le debemos" : "Nos debe"} ${m === "ARS" ? "$" : m} ${numero(Math.abs(v) / 100, m === "ARS" ? 0 : 2)}`)
    .join(" · ");

export const importe = (centavos: number, moneda: string) => `${moneda === "ARS" ? "$" : moneda} ${numero(centavos / 100, moneda === "ARS" ? 0 : 2)}`;

export const TIPOS_CC_PROV: Record<string, string> = {
  saldo_inicial: "Saldo inicial",
  factura: "Factura",
  pago: "Pago",
  cobro: "Cobro",
  nota_credito: "Nota de crédito",
  ajuste: "Ajuste",
  consignacion_vendida: "Pieza en consignación vendida",
  entregada_vendida: "Vendió una pieza nuestra",
};

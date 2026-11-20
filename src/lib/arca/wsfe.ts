/**
 * WSFEv1: factura electrónica. Último número autorizado, pedido de CAE, consulta de un comprobante y prueba de
 * conexión. Los importes viajan en pesos con dos decimales.
 */
import { ErrorValidacion } from "../config";
import type { AmbienteArca } from "./certificados";
import { buscar, enviarSoap, escapar, leerXml, lista } from "./soap";
import { obtenerTicket } from "./wsaa";

export const URL_WSFE: Record<AmbienteArca, string> = {
  homologacion: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  produccion: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};
const NS = "http://ar.gov.afip.dif.FEV1/";

export type PedidoCae = {
  puntoVenta: number;
  tipo: number;
  numero: number;
  concepto: 1 | 2 | 3;
  docTipo: number;
  docNro: string;
  condicionIvaReceptor: number;
  fecha: string; // aaaammdd
  total: number;
  noGravado: number;
  neto: number;
  exento: number;
  iva: number;
  ivas: { id: number; base: number; importe: number }[];
  asociados?: { tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string }[];
};
export type RespuestaCae = { resultado: "A" | "R" | "P"; cae: string | null; caeVence: string | null; observaciones: string[]; errores: string[] };

const plata = (c: number) => (c / 100).toFixed(2);

async function llamar(ambiente: AmbienteArca, cuit: string, metodo: string, interior: string) {
  const { token, sign } = await obtenerTicket(ambiente);
  const cuerpo = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soap:Body><ar:${metodo}><ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>${interior}</ar:${metodo}></soap:Body></soap:Envelope>`;
  const resp = leerXml(await enviarSoap(URL_WSFE[ambiente], cuerpo, `${NS}${metodo}`));
  const falla = buscar(resp, "faultstring");
  if (falla) throw new ErrorValidacion(`ARCA: ${String(falla)}`);
  return resp;
}

const erroresDe = (nodo: unknown) => lista(buscar(buscar(nodo, "Errors"), "Err") as { Code: string; Msg: string } | { Code: string; Msg: string }[]).map((e) => `${e.Code}: ${e.Msg}`);

export async function ultimoAutorizado(ambiente: AmbienteArca, cuit: string, puntoVenta: number, tipo: number) {
  const r = await llamar(ambiente, cuit, "FECompUltimoAutorizado", `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`);
  const errores = erroresDe(r);
  if (errores.length) throw new ErrorValidacion(`ARCA: ${errores.join(" · ")}`);
  return Number(buscar(r, "CbteNro") ?? 0);
}

export function armarPedido(p: PedidoCae) {
  const ivas = p.ivas.filter((x) => x.base > 0 || x.importe > 0);
  return `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${p.puntoVenta}</ar:PtoVta><ar:CbteTipo>${p.tipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>` +
    `<ar:Concepto>${p.concepto}</ar:Concepto><ar:DocTipo>${p.docTipo}</ar:DocTipo><ar:DocNro>${escapar(p.docNro)}</ar:DocNro><ar:CbteDesde>${p.numero}</ar:CbteDesde><ar:CbteHasta>${p.numero}</ar:CbteHasta><ar:CbteFch>${p.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${plata(p.total)}</ar:ImpTotal><ar:ImpTotConc>${plata(p.noGravado)}</ar:ImpTotConc><ar:ImpNeto>${plata(p.neto)}</ar:ImpNeto><ar:ImpOpEx>${plata(p.exento)}</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${plata(p.iva)}</ar:ImpIVA>` +
    (p.concepto !== 1 ? `<ar:FchServDesde>${p.fecha}</ar:FchServDesde><ar:FchServHasta>${p.fecha}</ar:FchServHasta><ar:FchVtoPago>${p.fecha}</ar:FchVtoPago>` : "") +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${p.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    (p.asociados?.length ? `<ar:CbtesAsoc>${p.asociados.map((a) => `<ar:CbteAsoc><ar:Tipo>${a.tipo}</ar:Tipo><ar:PtoVta>${a.puntoVenta}</ar:PtoVta><ar:Nro>${a.numero}</ar:Nro><ar:Cuit>${a.cuit}</ar:Cuit><ar:CbteFch>${a.fecha}</ar:CbteFch></ar:CbteAsoc>`).join("")}</ar:CbtesAsoc>` : "") +
    (ivas.length ? `<ar:Iva>${ivas.map((x) => `<ar:AlicIva><ar:Id>${x.id}</ar:Id><ar:BaseImp>${plata(x.base)}</ar:BaseImp><ar:Importe>${plata(x.importe)}</ar:Importe></ar:AlicIva>`).join("")}</ar:Iva>` : "") +
    `</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
}

export function leerRespuestaCae(resp: Record<string, unknown>): RespuestaCae {
  const det = buscar(resp, "FECAEDetResponse");
  const resultado = String(buscar(det, "Resultado") ?? buscar(resp, "Resultado") ?? "R") as RespuestaCae["resultado"];
  const obs = lista(buscar(buscar(det, "Observaciones"), "Obs") as { Code: string; Msg: string } | { Code: string; Msg: string }[]).map((o) => `${o.Code}: ${o.Msg}`);
  const cae = String(buscar(det, "CAE") ?? "") || null;
  const vence = String(buscar(det, "CAEFchVto") ?? "") || null;
  return { resultado, cae: resultado === "A" ? cae : null, caeVence: resultado === "A" ? vence : null, observaciones: obs, errores: erroresDe(resp) };
}

export async function solicitarCae(ambiente: AmbienteArca, cuit: string, p: PedidoCae) {
  return leerRespuestaCae(await llamar(ambiente, cuit, "FECAESolicitar", armarPedido(p)));
}

/** Datos de un comprobante ya autorizado (para no duplicar si la respuesta anterior se perdió). */
export async function consultarComprobante(ambiente: AmbienteArca, cuit: string, puntoVenta: number, tipo: number, numero: number) {
  const r = await llamar(ambiente, cuit, "FECompConsultar", `<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`);
  const g = buscar(r, "ResultGet");
  if (!g) return null;
  return { cae: String(buscar(g, "CodAutorizacion") ?? ""), caeVence: String(buscar(g, "FchVto") ?? ""), total: Math.round(Number(buscar(g, "ImpTotal") ?? 0) * 100), docNro: String(buscar(g, "DocNro") ?? "") };
}

/** Prueba de conexión: estado de los servidores de ARCA y puntos de venta habilitados para web services. */
export async function probarConexion(ambiente: AmbienteArca, cuit: string) {
  const r = await llamar(ambiente, cuit, "FEParamGetPtosVenta", "");
  const pvs = lista(buscar(buscar(r, "ResultGet"), "PtoVenta") as { Nro: string; Bloqueado: string; FchBaja: string } | { Nro: string; Bloqueado: string; FchBaja: string }[]);
  const errores = erroresDe(r).filter((e) => !e.startsWith("602")); // 602 = sin puntos de venta (normal en homologación)
  if (errores.length) throw new ErrorValidacion(`ARCA: ${errores.join(" · ")}`);
  return pvs.map((p) => ({ numero: Number(p.Nro), bloqueado: p.Bloqueado === "S", baja: p.FchBaja && p.FchBaja !== "NULL" ? p.FchBaja : null }));
}

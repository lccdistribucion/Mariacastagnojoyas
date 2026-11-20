/** Llamadas SOAP a ARCA (con tiempo máximo) y lectura de las respuestas XML. Se puede reemplazar en las pruebas. */
import { XMLParser } from "fast-xml-parser";

export type Transporte = (url: string, cuerpo: string, accion: string) => Promise<string>;

const porDefecto: Transporte = async (url, cuerpo, accion) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: accion }, body: cuerpo, signal: AbortSignal.timeout(25_000) });
  const texto = await r.text();
  if (!r.ok && !texto.includes("Envelope")) throw new Error(`ARCA respondió ${r.status}`);
  return texto;
};

let transporte: Transporte = porDefecto;
/** Solo para las pruebas automáticas. */
export function usarTransporte(t: Transporte | null) {
  transporte = t ?? porDefecto;
}
export const enviarSoap: Transporte = (url, cuerpo, accion) => transporte(url, cuerpo, accion);

const lector = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
export function leerXml(xml: string): Record<string, unknown> {
  return lector.parse(xml) as Record<string, unknown>;
}

/** Busca un nodo por nombre en cualquier nivel. */
export function buscar(obj: unknown, nombre: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  if (nombre in o) return o[nombre];
  for (const v of Object.values(o)) {
    const r = buscar(v, nombre);
    if (r !== undefined) return r;
  }
  return undefined;
}

export const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const lista = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

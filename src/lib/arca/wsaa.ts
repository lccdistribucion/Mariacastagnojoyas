/**
 * WSAA: autenticación con ARCA. Se arma el «ticket de pedido de acceso» (TRA), se firma con el certificado (CMS /
 * PKCS#7, SHA-256) y se canjea por un token y una firma que valen ~12 horas (se guardan y se reutilizan).
 */
import { and, desc, eq, gt } from "drizzle-orm";
import forge from "node-forge";
import { arcaTokens, db } from "@/db";
import { ErrorValidacion } from "../config";
import { leerCredenciales, type AmbienteArca } from "./certificados";
import { buscar, enviarSoap, escapar, leerXml } from "./soap";

export const URL_WSAA: Record<AmbienteArca, string> = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "-00:00").replace("Z", "-00:00");

export function armarTra(servicio: string, ahora = new Date()) {
  const desde = new Date(ahora.getTime() - 10 * 60_000);
  const hasta = new Date(ahora.getTime() + 10 * 60_000);
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${iso(desde)}</generationTime><expirationTime>${iso(hasta)}</expirationTime></header><service>${servicio}</service></loginTicketRequest>`;
}

/** Firma el TRA como CMS SignedData con el contenido incluido; devuelve base64 (lo que espera loginCms). */
export function firmarTra(tra: string, certPem: string, clavePem: string) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clavePem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() as unknown as string }],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

export async function obtenerTicket(ambiente: AmbienteArca, servicio = "wsfe") {
  const [vigente] = await db
    .select()
    .from(arcaTokens)
    .where(and(eq(arcaTokens.ambiente, ambiente), eq(arcaTokens.servicio, servicio), gt(arcaTokens.vence, new Date(Date.now() + 5 * 60_000))))
    .orderBy(desc(arcaTokens.vence))
    .limit(1);
  if (vigente) return { token: vigente.token, sign: vigente.sign };
  const { cert, clave } = leerCredenciales(ambiente);
  const cms = firmarTra(armarTra(servicio), cert, clave);
  const cuerpo = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const resp = leerXml(await enviarSoap(URL_WSAA[ambiente], cuerpo, ""));
  const falla = buscar(resp, "faultstring");
  if (falla) {
    // Si ya hay un ticket vigente emitido por otra vía, ARCA no da otro hasta que venza.
    if (String(falla).includes("alreadyAuthenticated")) throw new ErrorValidacion("ARCA dice que ya hay un acceso vigente para este certificado. Esperá unos minutos y reintentá.");
    throw new ErrorValidacion(`ARCA rechazó el acceso: ${String(falla)}`);
  }
  const retorno = String(buscar(resp, "loginCmsReturn") ?? "");
  const ticket = leerXml(retorno.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  const token = String(buscar(ticket, "token") ?? "");
  const sign = String(buscar(ticket, "sign") ?? "");
  const vence = new Date(String(buscar(ticket, "expirationTime") ?? ""));
  if (!token || !sign || Number.isNaN(vence.getTime())) throw new ErrorValidacion("ARCA no devolvió el acceso (respuesta inesperada).");
  await db.insert(arcaTokens).values({ ambiente, servicio, token, sign, vence });
  return { token, sign };
}

void escapar;

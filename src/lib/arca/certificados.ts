/**
 * Certificado digital para los web services de ARCA. El sistema genera la clave privada y el «pedido de
 * certificado» (CSR); la dueña lo sube en ARCA (Administración de certificados digitales / WSASS para homologación)
 * y carga acá el certificado que ARCA devuelve. La clave privada nunca sale del equipo.
 * Se guardan en data/arca/<ambiente>/ (clave.key y certificado.crt).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { ErrorValidacion } from "../config";

export type AmbienteArca = "homologacion" | "produccion";
export const CARPETA_ARCA = process.env.ARCA_DIR ?? path.join(process.cwd(), "data", "arca");
const carpeta = (a: AmbienteArca) => path.join(CARPETA_ARCA, a);
const archivoClave = (a: AmbienteArca) => path.join(carpeta(a), "clave.key");
const archivoCert = (a: AmbienteArca) => path.join(carpeta(a), "certificado.crt");

/** Genera una clave RSA de 2048 bits y el pedido de certificado (CSR) con el CUIT del negocio. Devuelve el CSR en PEM. */
export function generarPedido(ambiente: AmbienteArca, d: { cuit: string; razonSocial: string; alias: string }) {
  const cuit = d.cuit.replace(/\D/g, "");
  if (cuit.length !== 11) throw new ErrorValidacion("Cargá el CUIT del negocio (11 números) en los datos fiscales.");
  if (!d.razonSocial.trim()) throw new ErrorValidacion("Cargá la razón social en los datos fiscales.");
  const alias = d.alias.trim().replace(/[^a-zA-Z0-9]/g, "") || "mariacastagno";
  const claves = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = claves.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: d.razonSocial.trim().slice(0, 64) },
    { name: "commonName", value: alias },
    { type: "2.5.4.5", value: `CUIT ${cuit}` },
  ]);
  csr.sign(claves.privateKey, forge.md.sha256.create());
  mkdirSync(carpeta(ambiente), { recursive: true });
  writeFileSync(archivoClave(ambiente), forge.pki.privateKeyToPem(claves.privateKey), { mode: 0o600 });
  return forge.pki.certificationRequestToPem(csr);
}

/** Guarda el certificado que entregó ARCA, verificando que corresponda a la clave generada acá. */
export function guardarCertificado(ambiente: AmbienteArca, pem: string) {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(pem.trim());
  } catch {
    throw new ErrorValidacion("El archivo no es un certificado válido (tiene que ser el .crt que entrega ARCA).");
  }
  if (!existsSync(archivoClave(ambiente))) throw new ErrorValidacion("Primero generá el pedido de certificado desde acá (así se crea la clave).");
  const clave = forge.pki.privateKeyFromPem(readFileSync(archivoClave(ambiente), "utf8"));
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  if (pub.n.compareTo(clave.n) !== 0) throw new ErrorValidacion("Ese certificado no corresponde a la clave de este sistema. ¿Es el del pedido que se generó acá?");
  if (cert.validity.notAfter.getTime() < Date.now()) throw new ErrorValidacion("El certificado ya está vencido.");
  writeFileSync(archivoCert(ambiente), forge.pki.certificateToPem(cert));
  return { vence: cert.validity.notAfter, sujeto: cert.subject.getField("CN")?.value as string | undefined };
}

export function estadoCertificado(ambiente: AmbienteArca) {
  const tieneClave = existsSync(archivoClave(ambiente));
  if (!existsSync(archivoCert(ambiente))) return { tieneClave, tieneCertificado: false as const };
  const cert = forge.pki.certificateFromPem(readFileSync(archivoCert(ambiente), "utf8"));
  const serial = cert.subject.attributes.find((a) => a.type === "2.5.4.5")?.value as string | undefined;
  return { tieneClave, tieneCertificado: true as const, vence: cert.validity.notAfter, alias: cert.subject.getField("CN")?.value as string | undefined, cuit: serial?.replace(/\D/g, "") };
}

export function leerCredenciales(ambiente: AmbienteArca) {
  if (!existsSync(archivoClave(ambiente)) || !existsSync(archivoCert(ambiente))) throw new ErrorValidacion(`Falta el certificado de ARCA para ${ambiente === "produccion" ? "producción" : "homologación"} (Facturación → Configuración).`);
  return { cert: readFileSync(archivoCert(ambiente), "utf8"), clave: readFileSync(archivoClave(ambiente), "utf8") };
}

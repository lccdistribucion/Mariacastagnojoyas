/** PDF de la factura / nota de crédito / nota de débito electrónica con el QR de ARCA. */
import { toBuffer } from "bwip-js/node";
import { leerConfig } from "../config";
import { generarDocumento, type Bloque } from "../documentos/pdf";
import { fecha, numero } from "../formato";
import { formatoCuit } from "../identidad";
import { NOMBRE_CONDICION, NOMBRE_TIPO, numeroComprobante, urlQr } from "./calculo";
import { obtenerComprobante } from "./emision";

const $ = (c: number) => `$ ${numero(c / 100, 2)}`;
const ALIC: Record<number, string> = { 3: "0 %", 4: "10,5 %", 5: "21 %", 6: "27 %", 8: "5 %", 9: "2,5 %" };

export async function pdfComprobanteFiscal(id: number) {
  const c = await obtenerComprobante(id);
  if (!c || c.estado !== "autorizado" || c.numero == null) return null;
  const cfg = await leerConfig(["fiscal.razon_social", "fiscal.condicion_iva", "fiscal.iibb", "fiscal.inicio_actividades", "negocio.cuit", "negocio.direccion", "negocio.nombre"]);
  const cuit = cfg["negocio.cuit"].replace(/\D/g, "");
  const ri = cfg["fiscal.condicion_iva"] === "responsable_inscripto";
  const discrimina = c.letra === "A";
  const detalle = JSON.parse(c.detalle) as { descripcion: string; cantidad: number; subtotal: number; neto: number; iva: number; ivaPct: number }[];
  const ivas = JSON.parse(c.ivas) as { id: number; base: number; importe: number }[];
  const simulado = c.ambiente === "simulado";
  const bloques: Bloque[] = [
    {
      tipo: "datos",
      filas: [
        ["Cliente", c.receptor],
        ...(c.docTipo !== 99 ? [[c.docTipo === 80 ? "CUIT" : c.docTipo === 86 ? "CUIL" : "DNI", c.docTipo === 80 ? formatoCuit(c.docNro) : c.docNro] as [string, string]] : []),
        ["Condición frente al IVA", NOMBRE_CONDICION[c.condicionIvaReceptor] ?? "Consumidor Final"],
        ...(c.cliente?.domicilio ? [["Domicilio", [c.cliente.domicilio, c.cliente.localidad].filter(Boolean).join(", ")] as [string, string]] : []),
        ["Condición de venta", "Contado"],
        ...(c.asociado ? [["Comprobante asociado", `${NOMBRE_TIPO[c.asociado.tipo]} ${numeroComprobante(c.asociado.puntoVenta, c.asociado.numero)} del ${fecha(c.asociado.fecha)}`] as [string, string]] : []),
        ...(c.motivo ? [["Motivo", c.motivo.replace(/^Anulación:\s*/, "Anulación: ")] as [string, string]] : []),
      ],
    },
    {
      tipo: "tabla",
      columnas: discrimina
        ? [{ titulo: "Descripción", ancho: 50 }, { titulo: "Cant.", ancho: 8, derecha: true }, { titulo: "Neto", ancho: 16, derecha: true }, { titulo: "IVA", ancho: 10, derecha: true }, { titulo: "Subtotal", ancho: 16, derecha: true }]
        : [{ titulo: "Descripción", ancho: 70 }, { titulo: "Cant.", ancho: 10, derecha: true }, { titulo: "Importe", ancho: 20, derecha: true }],
      filas: detalle.map((d) => (discrimina ? [d.descripcion, String(d.cantidad), $(d.neto), `${numero(d.ivaPct / 100, d.ivaPct % 100 ? 1 : 0)} %`, $(d.subtotal)] : [d.descripcion, String(d.cantidad), $(d.subtotal)])),
    },
    {
      tipo: "totales",
      filas: [
        ...(discrimina ? [["Importe neto gravado", $(c.neto)] as [string, string], ...ivas.map((x) => [`IVA ${ALIC[x.id] ?? ""}`, $(x.importe)] as [string, string])] : []),
        ...(c.exento ? [["Exento", $(c.exento)] as [string, string]] : []),
        ...(c.noGravado && discrimina ? [["No gravado", $(c.noGravado)] as [string, string]] : []),
        ["Total", $(c.total), true],
      ],
    },
  ];
  // Régimen de Transparencia Fiscal al Consumidor (Ley 27.743): en la factura B se informa el IVA contenido.
  if (c.letra === "B") bloques.push({ tipo: "texto", chico: true, texto: `Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) — IVA contenido: ${$(c.iva)}.` });
  if (c.observaciones) bloques.push({ tipo: "texto", chico: true, texto: c.observaciones });
  const png = await toBuffer({ bcid: "qrcode", text: urlQr({ fecha: c.fecha, cuitEmisor: cuit || "0", puntoVenta: c.puntoVenta, tipo: c.tipo, numero: c.numero, total: c.total, docTipo: c.docTipo, docNro: c.docNro, cae: c.cae ?? "0" }), scale: 3 });
  bloques.push({ tipo: "qr", png, lineas: [simulado ? "COMPROBANTE SIMULADO — SIN VALIDEZ FISCAL" : "Comprobante autorizado por ARCA", `CAE N.º ${c.cae}`, `Vencimiento del CAE: ${c.caeVence ? fecha(c.caeVence) : "—"}`] });
  return generarDocumento({
    titulo: NOMBRE_TIPO[c.tipo].replace(/ [ABC]$/, ""),
    numero: numeroComprobante(c.puntoVenta, c.numero),
    fecha: c.fecha,
    leyenda: simulado ? "SIMULADO · SIN VALIDEZ FISCAL" : "ORIGINAL",
    fiscal: { letra: c.letra, codigo: c.tipo },
    emisor: [
      cfg["fiscal.razon_social"] || cfg["negocio.nombre"],
      cfg["negocio.direccion"],
      ri ? "IVA Responsable Inscripto" : "Responsable Monotributo",
      cuit && `CUIT ${formatoCuit(cuit)}`,
      [cfg["fiscal.iibb"] && `IIBB ${cfg["fiscal.iibb"]}`, cfg["fiscal.inicio_actividades"] && `Inicio de actividades ${cfg["fiscal.inicio_actividades"]}`].filter(Boolean).join(" · "),
    ].filter(Boolean) as string[],
    bloques,
  });
}

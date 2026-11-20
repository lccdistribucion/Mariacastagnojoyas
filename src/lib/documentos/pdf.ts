/**
 * Documentos imprimibles en A4 con la identidad de María Castagno: comprobante de venta, remito, certificado de
 * garantía, presupuesto, comprobante de recepción de reparación y orden de pedido a medida.
 * Mientras no esté la facturación electrónica (módulo 7), el comprobante dice «Documento no válido como factura».
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { leerConfig } from "../config";
import { fecha as fmtFecha } from "../formato";

const A4: [number, number] = [595.28, 841.89];
const M = 44;
const TINTA = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.45, 0.43, 0.4);
const LINEA = rgb(0.86, 0.84, 0.8);
const CHAMPAGNE = rgb(0.66, 0.54, 0.35);

export type Bloque =
  | { tipo: "titulo"; texto: string }
  | { tipo: "datos"; filas: [string, string][] }
  | { tipo: "tabla"; columnas: { titulo: string; ancho: number; derecha?: boolean }[]; filas: string[][] }
  | { tipo: "totales"; filas: [string, string, boolean?][] }
  | { tipo: "texto"; texto: string; chico?: boolean }
  | { tipo: "foto"; jpeg: Buffer; leyenda?: string[] }
  | { tipo: "espacio"; alto: number }
  | { tipo: "firma"; textos: string[] }
  | { tipo: "qr"; png: Buffer; lineas: string[] };

export type Documento = {
  titulo: string;
  numero?: string;
  fecha: Date;
  leyenda?: string;
  bloques: Bloque[];
  pie?: string;
  /** Factura electrónica: letra en el recuadro del centro y código ARCA. */
  fiscal?: { letra: string; codigo: number };
  /** Datos del emisor que reemplazan a los del negocio (razón social, CUIT, condición de IVA…). */
  emisor?: string[];
};

const limpio = (f: PDFFont, t: string) =>
  [...t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, "->").replace(/−/g, "-")]
    .map((c) => {
      try {
        f.encodeText(c);
        return c;
      } catch {
        return "?";
      }
    })
    .join("");

function renglones(f: PDFFont, texto: string, tam: number, ancho: number) {
  const out: string[] = [];
  for (const parrafo of limpio(f, texto).split("\n")) {
    let actual = "";
    for (const p of parrafo.split(" ")) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (f.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
      else {
        if (actual) out.push(actual);
        actual = p;
      }
    }
    out.push(actual);
  }
  return out;
}

export async function generarDocumento(d: Documento) {
  const cfg = await leerConfig(["negocio.nombre", "negocio.direccion", "negocio.telefono", "negocio.cuit", "negocio.web"]);
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.titulo}${d.numero ? ` ${d.numero}` : ""} — ${cfg["negocio.nombre"]}`);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public", "logo-negro.png")));
  const ancho = A4[0] - M * 2;
  let pagina!: PDFPage;
  let y = 0;

  const encabezado = () => {
    pagina = doc.addPage(A4);
    y = A4[1] - M;
    const alto = d.fiscal ? 21 : 30;
    const w = (logo.width / logo.height) * alto;
    pagina.drawImage(logo, { x: M, y: y - alto, width: w, height: alto });
    const datos = d.emisor ?? ([cfg["negocio.direccion"], cfg["negocio.telefono"], cfg["negocio.web"], cfg["negocio.cuit"] && `CUIT ${cfg["negocio.cuit"]}`].filter(Boolean) as string[]);
    if (d.fiscal) {
      const lado = 34;
      const x = A4[0] / 2 - lado / 2;
      pagina.drawRectangle({ x, y: y - lado, width: lado, height: lado, borderColor: TINTA, borderWidth: 1 });
      const l = d.fiscal.letra;
      pagina.drawText(l, { x: A4[0] / 2 - negrita.widthOfTextAtSize(l, 22) / 2, y: y - 25, size: 22, font: negrita, color: TINTA });
      const cod = `COD. ${String(d.fiscal.codigo).padStart(2, "0")}`;
      pagina.drawText(cod, { x: A4[0] / 2 - normal.widthOfTextAtSize(cod, 6.5) / 2, y: y - lado - 9, size: 6.5, font: normal, color: GRIS });
    }
    datos.forEach((t, i) => pagina.drawText(limpio(normal, t), { x: M, y: y - alto - 14 - i * 10, size: 8, font: normal, color: GRIS }));
    const tit = limpio(serif, d.titulo);
    pagina.drawText(tit, { x: A4[0] - M - serif.widthOfTextAtSize(tit, 18), y: y - 16, size: 18, font: serif, color: TINTA });
    const sub = limpio(normal, `${d.numero ? `N.º ${d.numero} · ` : ""}${fmtFecha(d.fecha)}`);
    pagina.drawText(sub, { x: A4[0] - M - normal.widthOfTextAtSize(sub, 9), y: y - 32, size: 9, font: normal, color: GRIS });
    if (d.leyenda) {
      const l = limpio(negrita, d.leyenda);
      pagina.drawText(l, { x: A4[0] - M - negrita.widthOfTextAtSize(l, 7.5), y: y - 44, size: 7.5, font: negrita, color: CHAMPAGNE });
    }
    y -= alto + 14 + Math.max(datos.length, 1) * 10 + 12;
    pagina.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINEA });
    y -= 18;
  };
  const espacio = (alto: number) => {
    if (y - alto < M + 30) encabezado();
  };

  encabezado();
  for (const b of d.bloques) {
    if (b.tipo === "espacio") y -= b.alto;
    if (b.tipo === "titulo") {
      espacio(30);
      pagina.drawText(limpio(negrita, b.texto.toUpperCase()), { x: M, y: y - 9, size: 8, font: negrita, color: CHAMPAGNE });
      y -= 18;
    }
    if (b.tipo === "datos") {
      for (const [k, v] of b.filas) {
        const ls = renglones(normal, v, 9.5, ancho - 130);
        espacio(ls.length * 12 + 4);
        pagina.drawText(limpio(normal, k), { x: M, y: y - 9, size: 8.5, font: normal, color: GRIS });
        ls.forEach((l, i) => pagina.drawText(l, { x: M + 130, y: y - 9 - i * 12, size: 9.5, font: normal, color: TINTA }));
        y -= ls.length * 12 + 4;
      }
      y -= 6;
    }
    if (b.tipo === "tabla") {
      const total = b.columnas.reduce((s, c) => s + c.ancho, 0);
      const anchos = b.columnas.map((c) => (c.ancho / total) * ancho);
      const fila = (celdas: string[], fuente: PDFFont, color = TINTA) => {
        const ls = celdas.map((c, i) => renglones(fuente, c, 9, anchos[i] - 8));
        const alto = Math.max(...ls.map((l) => l.length)) * 11 + 8;
        espacio(alto);
        let x = M;
        ls.forEach((l, i) => {
          l.forEach((t, j) => {
            const tx = b.columnas[i].derecha ? x + anchos[i] - 4 - fuente.widthOfTextAtSize(t, 9) : x + 4;
            pagina.drawText(t, { x: tx, y: y - 12 - j * 11, size: 9, font: fuente, color });
          });
          x += anchos[i];
        });
        y -= alto;
        pagina.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.4, color: LINEA });
      };
      fila(b.columnas.map((c) => c.titulo), negrita, GRIS);
      for (const f of b.filas) fila(f, normal);
      y -= 8;
    }
    if (b.tipo === "totales") {
      for (const [k, v, fuerte] of b.filas) {
        espacio(fuerte ? 20 : 14);
        const f = fuerte ? negrita : normal;
        const tam = fuerte ? 12 : 9.5;
        const vt = limpio(f, v);
        pagina.drawText(limpio(normal, k), { x: A4[0] - M - 220, y: y - tam, size: 9, font: normal, color: GRIS });
        pagina.drawText(vt, { x: A4[0] - M - f.widthOfTextAtSize(vt, tam), y: y - tam, size: tam, font: f, color: TINTA });
        y -= fuerte ? 20 : 14;
      }
      y -= 6;
    }
    if (b.tipo === "texto") {
      const tam = b.chico ? 8 : 9.5;
      for (const l of renglones(normal, b.texto, tam, ancho)) {
        espacio(tam + 4);
        pagina.drawText(l, { x: M, y: y - tam, size: tam, font: normal, color: b.chico ? GRIS : TINTA });
        y -= tam + 4;
      }
      y -= 6;
    }
    if (b.tipo === "foto") {
      let img: PDFImage | null = null;
      try {
        img = await doc.embedJpg(b.jpeg);
      } catch {}
      const lado = 120;
      espacio(lado + 10);
      if (img) {
        const esc = Math.min(lado / img.width, lado / img.height);
        pagina.drawImage(img, { x: M, y: y - img.height * esc, width: img.width * esc, height: img.height * esc });
      }
      (b.leyenda ?? []).forEach((t, i) => pagina.drawText(limpio(i ? normal : negrita, t), { x: M + lado + 16, y: y - 12 - i * 13, size: i ? 9 : 10.5, font: i ? normal : negrita, color: i ? GRIS : TINTA }));
      y -= lado + 14;
    }
    if (b.tipo === "qr") {
      const img = await doc.embedPng(b.png);
      const lado = 78;
      espacio(lado + 10);
      pagina.drawImage(img, { x: M, y: y - lado, width: lado, height: lado });
      b.lineas.forEach((t, i) => pagina.drawText(limpio(i ? normal : negrita, t), { x: M + lado + 14, y: y - 12 - i * 12, size: i ? 8.5 : 10, font: i ? normal : negrita, color: i ? GRIS : TINTA }));
      y -= lado + 12;
    }
    if (b.tipo === "firma") {
      espacio(60);
      y -= 34;
      const w = (ancho - 30) / b.textos.length;
      b.textos.forEach((t, i) => {
        const x = M + i * (w + 30);
        pagina.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.5, color: GRIS });
        pagina.drawText(limpio(normal, t), { x, y: y - 11, size: 8, font: normal, color: GRIS });
      });
      y -= 24;
    }
  }
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    if (d.pie) renglones(normal, d.pie, 7.5, ancho - 60).forEach((l, j) => p.drawText(l, { x: M, y: M - 6 - j * 9, size: 7.5, font: normal, color: GRIS }));
    if (paginas.length > 1) p.drawText(`${i + 1}/${paginas.length}`, { x: A4[0] - M - 18, y: M - 6, size: 7.5, font: normal, color: GRIS });
  });
  return doc.save();
}

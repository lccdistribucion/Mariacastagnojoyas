/**
 * Etiquetas imprimibles en PDF con código de barras (Code 128) y QR.
 * - colita: etiqueta colgante de joyería (70 × 12 mm): una mitad con código y barras, la otra con datos y precio.
 * - adhesiva: 40 × 25 mm con QR, código, nombre y precio.
 * - a4: hoja A4 de 3 × 8 etiquetas (70 × 37 mm), para impresora común.
 */
import { toBuffer } from "bwip-js/node";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

const MM = 72 / 25.4;
export type FormatoEtiqueta = "colita" | "adhesiva" | "a4";
export type DatosEtiqueta = { codigo: string; barras: string; nombre: string; detalle: string; precio: string | null };

const limpiar = (f: PDFFont, t: string) =>
  [...t].map((ch) => {
    try {
      f.encodeText(ch);
      return ch;
    } catch {
      return "?";
    }
  }).join("");

function recortar(f: PDFFont, t: string, tam: number, ancho: number) {
  let s = limpiar(f, t);
  while (s.length > 1 && f.widthOfTextAtSize(s, tam) > ancho) s = s.slice(0, -1);
  return s.length < t.length ? `${s.slice(0, -1)}…`.replace("…", ".") : s;
}

async function png(opciones: Parameters<typeof toBuffer>[0]) {
  return toBuffer(opciones);
}

export async function pdfEtiquetas(items: DatosEtiqueta[], formato: FormatoEtiqueta) {
  if (!items.length) throw new Error("Sin etiquetas");
  const doc = await PDFDocument.create();
  doc.setTitle("Etiquetas");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const negro = rgb(0, 0, 0);

  const barras = new Map<string, PDFImage>();
  const qrs = new Map<string, PDFImage>();
  const imgBarras = async (t: string) => {
    if (!barras.has(t)) barras.set(t, await doc.embedPng(await png({ bcid: "code128", text: t, scale: 3, height: 10, includetext: false })));
    return barras.get(t)!;
  };
  const imgQr = async (t: string) => {
    if (!qrs.has(t)) qrs.set(t, await doc.embedPng(await png({ bcid: "qrcode", text: t, scale: 4, eclevel: "M" } as Parameters<typeof toBuffer>[0])));
    return qrs.get(t)!;
  };

  const dibujar = async (page: PDFPage, x: number, y: number, w: number, h: number, e: DatosEtiqueta) => {
    if (formato === "colita") {
      // Mitad izquierda: código y barras. Mitad derecha (la que se dobla): nombre, detalle y precio.
      const mitad = w / 2;
      const b = await imgBarras(e.barras);
      const pad = 1.2 * MM;
      page.drawText(recortar(negrita, e.codigo, 6, mitad - pad * 2), { x: x + pad, y: y + h - pad - 5, size: 6, font: negrita, color: negro });
      page.drawImage(b, { x: x + pad, y: y + pad, width: mitad - pad * 2, height: h - pad * 2 - 6.5 });
      const xd = x + mitad + pad;
      const an = mitad - pad * 2;
      page.drawText(recortar(normal, e.nombre, 5.2, an), { x: xd, y: y + h - pad - 5, size: 5.2, font: normal, color: negro });
      page.drawText(recortar(normal, e.detalle, 5, an), { x: xd, y: y + h - pad - 11, size: 5, font: normal, color: negro });
      if (e.precio) page.drawText(recortar(negrita, e.precio, 7, an), { x: xd, y: y + pad, size: 7, font: negrita, color: negro });
      page.drawLine({ start: { x: x + mitad, y }, end: { x: x + mitad, y: y + h }, thickness: 0.3, color: rgb(0.75, 0.75, 0.75), dashArray: [1, 1.5] });
      return;
    }
    const pad = (formato === "a4" ? 3 : 1.5) * MM;
    const q = await imgQr(e.barras);
    const lado = Math.min(h - pad * 2, w * 0.4);
    page.drawImage(q, { x: x + pad, y: y + h - pad - lado, width: lado, height: lado });
    const xt = x + pad * 2 + lado;
    const an = w - (xt - x) - pad;
    const t1 = formato === "a4" ? 9 : 6.5;
    page.drawText(recortar(negrita, e.codigo, t1, an), { x: xt, y: y + h - pad - t1, size: t1, font: negrita, color: negro });
    page.drawText(recortar(normal, e.nombre, t1 - 1.5, an), { x: xt, y: y + h - pad - t1 * 2.2, size: t1 - 1.5, font: normal, color: negro });
    page.drawText(recortar(normal, e.detalle, t1 - 2, an), { x: xt, y: y + h - pad - t1 * 3.3, size: t1 - 2, font: normal, color: negro });
    if (e.precio) page.drawText(recortar(negrita, e.precio, t1 + 2, an), { x: xt, y: y + pad + (formato === "a4" ? 12 : 0), size: t1 + 2, font: negrita, color: negro });
    if (formato === "a4") {
      const b = await imgBarras(e.barras);
      page.drawImage(b, { x: x + pad, y: y + pad, width: w - pad * 2, height: 10 });
    }
  };

  if (formato === "a4") {
    const [W, H] = [210 * MM, 297 * MM];
    const [cols, filas, w, h] = [3, 8, 70 * MM, 37 * MM];
    const margenY = (H - filas * h) / 2;
    for (let i = 0; i < items.length; i += cols * filas) {
      const page = doc.addPage([W, H]);
      for (let j = 0; j < cols * filas && i + j < items.length; j++) {
        const c = j % cols;
        const f = Math.floor(j / cols);
        await dibujar(page, c * w, H - margenY - (f + 1) * h, w, h, items[i + j]);
      }
    }
  } else {
    // Impresoras térmicas de etiquetas: una etiqueta por página, del tamaño exacto.
    const [w, h] = formato === "colita" ? [70 * MM, 12 * MM] : [40 * MM, 25 * MM];
    for (const e of items) await dibujar(doc.addPage([w, h]), 0, 0, w, h, e);
  }
  return doc.save();
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { fechaHora } from "../formato";
import type { Listado } from "./tabla";

const A4_APAISADA: [number, number] = [841.89, 595.28];
const MARGEN = 36;
const TINTA = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.45, 0.43, 0.4);
const LINEA = rgb(0.88, 0.86, 0.83);

/** Las fuentes estándar de PDF solo traen el alfabeto occidental: lo demás se reemplaza por algo parecido. */
function seguro(fuente: PDFFont, texto: string) {
  const t = texto.replace(/→/g, "->").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
  let out = "";
  for (const ch of t) {
    try {
      fuente.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Corta un texto en renglones que entren en `ancho`. */
function renglones(fuente: PDFFont, texto: string, tam: number, ancho: number) {
  const palabras = seguro(fuente, texto).split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      // palabra más larga que la columna: se corta
      let resto = p;
      while (fuente.widthOfTextAtSize(resto, tam) > ancho && resto.length > 1) {
        let n = resto.length;
        while (n > 1 && fuente.widthOfTextAtSize(resto.slice(0, n), tam) > ancho) n--;
        lineas.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      actual = resto;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

function valorTexto(v: unknown) {
  if (v == null) return "";
  if (v instanceof Date) return fechaHora(v);
  return String(v);
}

/** Listado en PDF apaisado: logo, título, tabla con encabezado repetido en cada hoja y «Página X de Y». */
export async function aPdf<T>(l: Listado<T>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`María Castagno — ${l.titulo}`);
  doc.setCreator("María Castagno — Sistema de gestión");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public", "logo-negro.png")));

  const anchoUtil = A4_APAISADA[0] - MARGEN * 2;
  const totalPeso = l.columnas.reduce((s, c) => s + (c.ancho ?? 16), 0);
  const anchos = l.columnas.map((c) => ((c.ancho ?? 16) / totalPeso) * anchoUtil);
  const TAM = 8;
  const ALTO_RENGLON = 10.5;
  const PAD = 4;

  let pagina: PDFPage;
  let y = 0;

  const nuevaPagina = () => {
    pagina = doc.addPage(A4_APAISADA);
    y = A4_APAISADA[1] - MARGEN;
    const escala = 24 / logo.height;
    pagina.drawImage(logo, { x: MARGEN, y: y - 24, width: logo.width * escala, height: 24 });
    pagina.drawText(seguro(negrita, l.titulo), { x: MARGEN + logo.width * escala + 16, y: y - 12, size: 13, font: negrita, color: TINTA });
    pagina.drawText(seguro(normal, `${l.subtitulo ? `${l.subtitulo} · ` : ""}Generado el ${fechaHora(new Date())}`), {
      x: MARGEN + logo.width * escala + 16,
      y: y - 24,
      size: 8,
      font: normal,
      color: GRIS,
    });
    y -= 40;
    // encabezado de la tabla
    pagina.drawRectangle({ x: MARGEN, y: y - 16, width: anchoUtil, height: 16, color: TINTA });
    let x = MARGEN;
    l.columnas.forEach((c, i) => {
      const t = renglones(negrita, c.titulo, TAM, anchos[i] - PAD * 2)[0];
      pagina.drawText(t, { x: x + PAD, y: y - 11, size: TAM, font: negrita, color: rgb(1, 1, 1) });
      x += anchos[i];
    });
    y -= 16;
  };

  nuevaPagina();
  for (const fila of l.filas) {
    const celdas = l.columnas.map((c, i) => renglones(normal, valorTexto(c.valor(fila)), TAM, anchos[i] - PAD * 2));
    const alto = Math.max(...celdas.map((r) => r.length)) * ALTO_RENGLON + PAD * 2;
    if (y - alto < MARGEN + 20) nuevaPagina();
    let x = MARGEN;
    celdas.forEach((lineas, i) => {
      lineas.forEach((ln, j) => {
        const ancho = normal.widthOfTextAtSize(ln, TAM);
        const xx = l.columnas[i].alinear === "der" ? x + anchos[i] - PAD - ancho : x + PAD;
        pagina!.drawText(ln, { x: xx, y: y - PAD - 8 - j * ALTO_RENGLON, size: TAM, font: normal, color: TINTA });
      });
      x += anchos[i];
    });
    y -= alto;
    pagina!.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + anchoUtil, y }, thickness: 0.5, color: LINEA });
  }
  if (!l.filas.length)
    pagina!.drawText("No hay datos para los filtros elegidos.", { x: MARGEN + PAD, y: y - 16, size: 9, font: normal, color: GRIS });

  const paginas = doc.getPages();
  paginas.forEach((p, i) =>
    p.drawText(`Página ${i + 1} de ${paginas.length}`, {
      x: A4_APAISADA[0] - MARGEN - 70,
      y: MARGEN - 16,
      size: 8,
      font: normal,
      color: GRIS,
    }),
  );
  return doc.save();
}

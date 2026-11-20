import ExcelJS from "exceljs";
import { fechaHora } from "../formato";
import type { Listado } from "./tabla";

/** Genera un .xlsx con título, filtros aplicados, encabezado fijo y columnas con su ancho. */
export async function aExcel<T>(l: Listado<T>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "María Castagno — Sistema de gestión";
  wb.created = new Date();
  const ws = wb.addWorksheet(l.titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  ws.getCell("A1").value = `María Castagno · ${l.titulo}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = `${l.subtitulo ? `${l.subtitulo} · ` : ""}Generado el ${fechaHora(new Date())}`;
  ws.getCell("A2").font = { color: { argb: "FF666666" }, size: 9 };
  const encabezado = ws.getRow(4);
  l.columnas.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141414" } };
    celda.alignment = { vertical: "middle" };
    ws.getColumn(i + 1).width = c.ancho ?? 16;
    if (c.formatoExcel) ws.getColumn(i + 1).numFmt = c.formatoExcel;
  });
  l.filas.forEach((f, r) => {
    const fila = ws.getRow(5 + r);
    l.columnas.forEach((c, i) => {
      const v = c.valor(f);
      const celda = fila.getCell(i + 1);
      celda.value = v instanceof Date ? v : (v ?? "");
      if (v instanceof Date) celda.numFmt = "dd/mm/yyyy hh:mm";
      celda.alignment = { wrapText: true, vertical: "top", horizontal: c.alinear === "der" ? "right" : "left" };
    });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: l.columnas.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

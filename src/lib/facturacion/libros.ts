/**
 * Libro IVA Ventas (comprobantes autorizados del ambiente en uso; las notas de crédito restan) y Libro IVA Compras
 * (facturas A, B y C de proveedores, pasadas a pesos con el tipo de cambio de cada compra). Para el contador.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { compras, comprobantesFiscales, db, proveedores } from "@/db";
import { aExcel } from "../exportar/excel";
import type { Listado } from "../exportar/tabla";
import { claseDe, NOMBRE_TIPO, numeroComprobante } from "./calculo";
import { configuracionFiscal } from "./emision";

const pesos = (c: number) => Math.round(c) / 100;
const ALIC: Record<number, string> = { 3: "0", 4: "10,5", 5: "21", 6: "27", 8: "5", 9: "2,5" };

export async function libroVentas(desde: Date, hasta: Date) {
  const { ambiente } = await configuracionFiscal();
  const filas = await db
    .select()
    .from(comprobantesFiscales)
    .where(and(eq(comprobantesFiscales.estado, "autorizado"), eq(comprobantesFiscales.ambiente, ambiente), gte(comprobantesFiscales.fecha, desde), lte(comprobantesFiscales.fecha, hasta)))
    .orderBy(comprobantesFiscales.fecha, comprobantesFiscales.id);
  return filas.map((c) => {
    const s = claseDe(c.tipo) === "nota_credito" ? -1 : 1;
    const ivas = JSON.parse(c.ivas) as { id: number; base: number; importe: number }[];
    const por = (id: number) => ivas.find((x) => x.id === id) ?? { base: 0, importe: 0 };
    return {
      fecha: c.fecha,
      comprobante: `${NOMBRE_TIPO[c.tipo]} ${numeroComprobante(c.puntoVenta, c.numero)}`,
      receptor: c.receptor,
      doc: c.docTipo === 99 ? "—" : `${c.docTipo === 80 ? "CUIT" : c.docTipo === 86 ? "CUIL" : "DNI"} ${c.docNro}`,
      neto21: s * por(5).base,
      iva21: s * por(5).importe,
      neto105: s * por(4).base,
      iva105: s * por(4).importe,
      otrasAlic: s * ivas.filter((x) => ![4, 5].includes(x.id)).reduce((t, x) => t + x.base + x.importe, 0),
      exento: s * c.exento,
      noGravado: s * c.noGravado,
      total: s * c.total,
      cae: c.cae ?? "",
      ivasTexto: ivas.map((x) => `${ALIC[x.id] ?? x.id} %`).join(" / "),
      neto: s * c.neto,
      iva: s * c.iva,
    };
  });
}

export async function libroCompras(desde: Date, hasta: Date) {
  const filas = await db
    .select({ c: compras, prov: proveedores.razonSocial, cuit: proveedores.cuit })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .where(and(eq(compras.anulada, false), inArray(compras.tipoComprobante, ["A", "B", "C"]), gte(compras.fecha, desde), lte(compras.fecha, hasta)))
    .orderBy(compras.fecha);
  return filas.map(({ c, prov, cuit }) => {
    const tc = c.tipoCambio / 1_000_000;
    const a = (x: number) => Math.round(x * tc);
    return {
      fecha: c.fecha,
      comprobante: `Factura ${c.tipoComprobante} ${numeroComprobante(c.puntoVenta ?? 0, c.numero)}`,
      proveedor: prov,
      cuit: cuit ?? "",
      moneda: c.moneda === "ARS" ? "" : `${c.moneda} a ${tc.toLocaleString("es-AR")}`,
      neto: a(c.neto),
      iva: a(c.iva),
      percIva: a(c.percepcionIva),
      percIibb: a(c.percepcionIibb),
      otros: a(c.otrosImpuestos),
      total: a(c.total),
    };
  });
}

export async function excelLibroVentas(desde: Date, hasta: Date, titulo: string) {
  const filas = await libroVentas(desde, hasta);
  const l: Listado<(typeof filas)[number]> = {
    titulo: "Libro IVA Ventas",
    subtitulo: titulo,
    filas,
    columnas: [
      { titulo: "Fecha", valor: (f) => f.fecha, ancho: 12 },
      { titulo: "Comprobante", valor: (f) => f.comprobante, ancho: 30 },
      { titulo: "Cliente", valor: (f) => f.receptor, ancho: 28 },
      { titulo: "Documento", valor: (f) => f.doc, ancho: 18 },
      { titulo: "Neto 21 %", valor: (f) => pesos(f.neto21), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "IVA 21 %", valor: (f) => pesos(f.iva21), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Neto 10,5 %", valor: (f) => pesos(f.neto105), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "IVA 10,5 %", valor: (f) => pesos(f.iva105), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Otras alícuotas", valor: (f) => pesos(f.otrasAlic), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Exento", valor: (f) => pesos(f.exento), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "No gravado", valor: (f) => pesos(f.noGravado), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Total", valor: (f) => pesos(f.total), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "CAE", valor: (f) => f.cae, ancho: 18 },
    ],
  };
  return aExcel(l);
}

export async function excelLibroCompras(desde: Date, hasta: Date, titulo: string) {
  const filas = await libroCompras(desde, hasta);
  const l: Listado<(typeof filas)[number]> = {
    titulo: "Libro IVA Compras",
    subtitulo: titulo,
    filas,
    columnas: [
      { titulo: "Fecha", valor: (f) => f.fecha, ancho: 12 },
      { titulo: "Comprobante", valor: (f) => f.comprobante, ancho: 26 },
      { titulo: "Proveedor", valor: (f) => f.proveedor, ancho: 28 },
      { titulo: "CUIT", valor: (f) => f.cuit, ancho: 14 },
      { titulo: "Moneda", valor: (f) => f.moneda, ancho: 14 },
      { titulo: "Neto", valor: (f) => pesos(f.neto), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "IVA", valor: (f) => pesos(f.iva), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Percepción IVA", valor: (f) => pesos(f.percIva), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Percepción IIBB", valor: (f) => pesos(f.percIibb), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Otros impuestos", valor: (f) => pesos(f.otros), formatoExcel: "#,##0.00", alinear: "der" },
      { titulo: "Total", valor: (f) => pesos(f.total), formatoExcel: "#,##0.00", alinear: "der" },
    ],
  };
  return aExcel(l);
}

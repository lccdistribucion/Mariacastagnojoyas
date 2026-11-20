/**
 * Reglas fiscales (sin base de datos): letra del comprobante, código ARCA, documento del receptor y cálculo de neto e
 * IVA por alícuota. Los precios del negocio son FINALES (con IVA incluido): el IVA se calcula «hacia adentro».
 * Tratamientos por ítem (a validar con el contador):
 *  - general: IVA a la alícuota de la pieza sobre el total del ítem.
 *  - bienes_usados: IVA solo sobre la diferencia entre el precio y el costo de compra; el costo va como «no gravado».
 *  - exento: sin IVA (operación exenta).
 */
export type Letra = "A" | "B" | "C";
export type Clase = "factura" | "nota_debito" | "nota_credito";
export type CondicionEmisor = "responsable_inscripto" | "monotributo";

export const CODIGOS: Record<Letra, Record<Clase, number>> = {
  A: { factura: 1, nota_debito: 2, nota_credito: 3 },
  B: { factura: 6, nota_debito: 7, nota_credito: 8 },
  C: { factura: 11, nota_debito: 12, nota_credito: 13 },
};
export const NOMBRE_TIPO: Record<number, string> = {
  1: "Factura A", 2: "Nota de débito A", 3: "Nota de crédito A",
  6: "Factura B", 7: "Nota de débito B", 8: "Nota de crédito B",
  11: "Factura C", 12: "Nota de débito C", 13: "Nota de crédito C",
};
export const claseDe = (tipo: number): Clase => ([3, 8, 13].includes(tipo) ? "nota_credito" : [2, 7, 12].includes(tipo) ? "nota_debito" : "factura");
export const letraDe = (tipo: number): Letra => (tipo <= 3 ? "A" : tipo <= 8 ? "B" : "C");

/** Condición frente al IVA del receptor (códigos ARCA para CondicionIVAReceptorId). */
export const CONDICION_RECEPTOR: Record<string, number> = { responsable_inscripto: 1, exento: 4, consumidor_final: 5, monotributo: 6 };
export const NOMBRE_CONDICION: Record<number, string> = { 1: "IVA Responsable Inscripto", 4: "IVA Sujeto Exento", 5: "Consumidor Final", 6: "Responsable Monotributo" };

/** Alícuotas de IVA (centésimos de punto → código ARCA). */
export const ALICUOTAS: Record<number, number> = { 0: 3, 250: 9, 500: 8, 1050: 4, 2100: 5, 2700: 6 };

export type Receptor = { nombre: string; tipoDoc: string | null; documento: string | null; condicionIva: string; domicilio?: string | null };

export function letraPara(emisor: CondicionEmisor, receptor: Receptor | null): Letra {
  if (emisor === "monotributo") return "C";
  return receptor?.condicionIva === "responsable_inscripto" ? "A" : "B";
}

/** Tipo y número de documento para ARCA. */
export function documentoReceptor(r: Receptor | null) {
  const doc = (r?.documento ?? "").replace(/\D/g, "");
  if (!r || !doc) return { docTipo: 99, docNro: "0" };
  if (r.tipoDoc === "CUIT" || (doc.length === 11 && r.tipoDoc !== "CUIL")) return { docTipo: 80, docNro: doc };
  if (r.tipoDoc === "CUIL") return { docTipo: 86, docNro: doc };
  return { docTipo: 96, docNro: doc };
}

export type ItemFiscal = { descripcion: string; cantidad: number; subtotal: number; ivaPct: number; tratamiento: string; costo: number };
export type Importes = { neto: number; iva: number; exento: number; noGravado: number; total: number; ivas: { id: number; base: number; importe: number }[]; detalle: (ItemFiscal & { netoItem: number; ivaItem: number })[] };

/**
 * Reparte un total final entre los ítems (descuentos y recargos proporcionales) y calcula neto e IVA.
 * `total`: lo que paga el cliente; los subtotales de los ítems se ajustan para que sumen exactamente eso.
 */
export function calcularImportes(items: ItemFiscal[], total: number, letra: Letra): Importes {
  const suma = items.reduce((s, i) => s + i.subtotal, 0);
  if (!items.length || suma <= 0) throw new Error("Sin ítems para facturar");
  // Prorrateo del total final (descuento/recargo) en centavos, cuadrando el último.
  let acumulado = 0;
  const finales = items.map((it, i) => {
    const v = i === items.length - 1 ? total - acumulado : Math.round((it.subtotal * total) / suma);
    acumulado += v;
    return v;
  });
  const ivas = new Map<number, { id: number; base: number; importe: number }>();
  let neto = 0;
  let iva = 0;
  let exento = 0;
  let noGravado = 0;
  const detalle = items.map((it, i) => {
    const bruto = finales[i];
    if (letra === "C") {
      neto += bruto;
      return { ...it, subtotal: bruto, netoItem: bruto, ivaItem: 0 };
    }
    if (it.tratamiento === "exento") {
      exento += bruto;
      return { ...it, subtotal: bruto, netoItem: bruto, ivaItem: 0 };
    }
    const costo = it.tratamiento === "bienes_usados" ? Math.min(bruto, Math.max(0, Math.round((it.costo * bruto) / Math.max(1, it.subtotal)))) : 0;
    noGravado += costo;
    const gravado = bruto - costo;
    const n = Math.round(gravado / (1 + it.ivaPct / 10000));
    const im = gravado - n;
    neto += n;
    iva += im;
    const id = ALICUOTAS[it.ivaPct] ?? 5;
    const a = ivas.get(id) ?? { id, base: 0, importe: 0 };
    a.base += n;
    a.importe += im;
    ivas.set(id, a);
    return { ...it, subtotal: bruto, netoItem: n, ivaItem: im };
  });
  return { neto, iva, exento, noGravado, total, ivas: [...ivas.values()], detalle };
}

/** Texto de un número de comprobante: 00001-00000123 */
export const numeroComprobante = (pv: number, nro: number | null) => `${String(pv).padStart(5, "0")}-${nro == null ? "--------" : String(nro).padStart(8, "0")}`;

/** URL del QR de ARCA (RG 4892): JSON en base64 dentro de https://www.arca.gob.ar/fe/qr/?p= */
export function urlQr(c: { fecha: Date; cuitEmisor: string; puntoVenta: number; tipo: number; numero: number; total: number; docTipo: number; docNro: string; cae: string }) {
  const datos = {
    ver: 1,
    fecha: c.fecha.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
    cuit: Number(c.cuitEmisor),
    ptoVta: c.puntoVenta,
    tipoCmp: c.tipo,
    nroCmp: c.numero,
    importe: Number((c.total / 100).toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: c.docTipo,
    nroDocRec: Number(c.docNro),
    tipoCodAut: "E",
    codAut: Number(c.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString("base64")}`;
}

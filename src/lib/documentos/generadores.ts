/** Arma cada documento con los datos del sistema. */
import { asc, eq } from "drizzle-orm";
import { db, leyesMetal, productoFotos, productoPiedras } from "@/db";
import { leerConfig } from "../config";
import { fecha, numero } from "../formato";
import { formatoCuit } from "../identidad";
import { fotoJpeg } from "../stock/fotos";
import { gramos } from "../stock/vista";
import { obtenerPedido } from "../taller/pedidos";
import { obtenerReparacion, TRABAJOS } from "../taller/reparaciones";
import { obtenerVenta } from "../ventas/consultas";
import { obtenerPresupuesto } from "../ventas/presupuestos";
import { generarDocumento, type Bloque } from "./pdf";

const $ = (c: number) => `$ ${numero(c / 100, 2)}`;
const NO_FACTURA = "DOCUMENTO NO VÁLIDO COMO FACTURA";

function datosCliente(c: { nombre: string; tipoDoc: string | null; documento: string | null; domicilio: string | null; localidad: string | null; whatsapp: string | null } | null): Bloque[] {
  if (!c) return [{ tipo: "datos", filas: [["Cliente", "Consumidor final"]] }];
  return [
    {
      tipo: "datos",
      filas: [
        ["Cliente", c.nombre],
        ...(c.documento ? [[c.tipoDoc ?? "Doc.", c.tipoDoc === "CUIT" || c.tipoDoc === "CUIL" ? formatoCuit(c.documento) : c.documento] as [string, string]] : []),
        ...(c.domicilio || c.localidad ? [["Domicilio", [c.domicilio, c.localidad].filter(Boolean).join(", ")] as [string, string]] : []),
        ...(c.whatsapp ? [["WhatsApp", `+${c.whatsapp}`] as [string, string]] : []),
      ],
    },
  ];
}

export async function pdfVenta(id: number, variante: "comprobante" | "remito") {
  const v = await obtenerVenta(id);
  if (!v) return null;
  const conPrecios = variante === "comprobante";
  const bloques: Bloque[] = [
    ...datosCliente(v.cliente),
    { tipo: "titulo", texto: "Detalle" },
    {
      tipo: "tabla",
      columnas: conPrecios ? [{ titulo: "Descripción", ancho: 60 }, { titulo: "Cant.", ancho: 8, derecha: true }, { titulo: "Unitario", ancho: 16, derecha: true }, { titulo: "Importe", ancho: 16, derecha: true }] : [{ titulo: "Descripción", ancho: 85 }, { titulo: "Cant.", ancho: 15, derecha: true }],
      filas: v.items.map(({ i, p }) => {
        const desc = `${i.descripcion}${p ? `${p.pesoNetoMg ? ` · ${gramos(p.pesoNetoMg)}` : ""}${p.talle ? ` · talle ${p.talle}` : ""}` : ""}${i.devueltos ? ` (devuelto ${i.devueltos})` : ""}`;
        return conPrecios ? [desc, String(i.cantidad), $(i.precioUnitario), $(i.subtotal)] : [desc, String(i.cantidad)];
      }),
    },
  ];
  if (conPrecios) {
    bloques.push({
      tipo: "totales",
      filas: [
        ["Subtotal", $(v.subtotal)],
        ...(v.descuento ? [[`Descuento ${numero(v.descuentoPct / 100, v.descuentoPct % 100 ? 1 : 0)} %`, `− ${$(v.descuento)}`] as [string, string]] : []),
        ...(v.canje ? [["Canje (metal entregado)", `− ${$(v.canje)}`] as [string, string]] : []),
        ...(v.recargos ? [[v.recargos > 0 ? "Recargo por medio de pago" : "Descuento por medio de pago", $(v.recargos)] as [string, string]] : []),
        ["Total", $(v.total + v.recargos), true],
      ],
    });
    const pagos = v.pagos.filter((x) => !x.c.anulado);
    if (pagos.length || v.aCuentaCorriente) {
      bloques.push({ tipo: "titulo", texto: "Forma de pago" });
      bloques.push({
        tipo: "datos",
        filas: [
          ...pagos.map((x) => [x.medio, `${x.c.moneda === "ARS" ? $(x.c.importe) : `${x.c.moneda} ${numero(x.c.importe / 100, 2)} (cambio ${numero(x.c.tipoCambio / 1_000_000, 2)})`}${x.c.cuotas && x.c.cuotas > 1 ? ` en ${x.c.cuotas} cuotas` : ""}`] as [string, string]),
          ...(v.aCuentaCorriente ? [["Cuenta corriente", $(v.aCuentaCorriente)] as [string, string]] : []),
        ],
      });
    }
    if (v.canjes.length) {
      const leyes = await db.select().from(leyesMetal);
      bloques.push({ tipo: "texto", chico: true, texto: `Metal recibido en canje: ${v.canjes.map((c) => `${c.descripcion}, ${leyes.find((l) => l.id === c.leyId)?.nombre} ${gramos(c.pesoMg)} a ${$(c.precioGramo)}/g`).join("; ")}.` });
    }
  } else bloques.push({ tipo: "firma", textos: ["Recibí conforme", "Aclaración y DNI"] });
  if (v.garantiaMeses && conPrecios && v.items.some(({ i }) => i.tipo === "pieza")) bloques.push({ tipo: "texto", chico: true, texto: `Garantía de ${v.garantiaMeses} meses sobre las piezas vendidas (ver certificado). Conservá este comprobante.` });
  if (v.notas) bloques.push({ tipo: "texto", chico: true, texto: v.notas });
  return generarDocumento({
    titulo: conPrecios ? "Comprobante de venta" : "Remito",
    numero: String(v.numero).padStart(6, "0"),
    fecha: v.fecha,
    leyenda: conPrecios ? NO_FACTURA : undefined,
    bloques,
    pie: `Atendido por ${v.vendedor ?? "—"}. ${v.anulada ? "ANULADA." : ""}`,
  });
}

export async function pdfGarantia(id: number) {
  const v = await obtenerVenta(id);
  if (!v) return null;
  const hasta = new Date(v.fecha);
  hasta.setMonth(hasta.getMonth() + v.garantiaMeses);
  const bloques: Bloque[] = [
    { tipo: "texto", texto: `Certificamos que las piezas detalladas fueron adquiridas en María Castagno${v.cliente ? ` por ${v.cliente.nombre}` : ""} el ${fecha(v.fecha)}, y que corresponden a la descripción, metal y ley indicados.` },
    { tipo: "espacio", alto: 6 },
  ];
  const leyes = await db.select().from(leyesMetal);
  for (const { i, p } of v.items.filter((x) => x.i.tipo === "pieza" && x.p)) {
    const [f] = await db.select().from(productoFotos).where(eq(productoFotos.productoId, p!.id)).orderBy(asc(productoFotos.orden)).limit(1);
    const piedras = await db.select().from(productoPiedras).where(eq(productoPiedras.productoId, p!.id));
    const leyenda = [
      i.descripcion,
      [leyes.find((l) => l.id === p!.leyId)?.nombre, p!.metalDetalle].filter(Boolean).join(" · ") || "—",
      [p!.pesoNetoMg != null && `Peso neto ${gramos(p!.pesoNetoMg)}`, p!.pesoBrutoMg != null && `bruto ${gramos(p!.pesoBrutoMg)}`, p!.talle && `talle ${p!.talle}`].filter(Boolean).join(" · "),
      ...piedras.map((x) => `${x.cantidad} × ${x.tipo}${x.quilates ? ` ${numero(x.quilates / 100, 2)} ct` : ""}${x.calidad ? ` ${x.calidad}` : ""}${x.certificado ? ` · cert. ${x.certificado}` : ""}`),
    ];
    const jpeg = f ? await fotoJpeg(f.archivo) : null;
    bloques.push(jpeg ? { tipo: "foto", jpeg, leyenda } : { tipo: "datos", filas: [[i.descripcion, leyenda.slice(1).join(" · ")]] });
  }
  const cfg = await leerConfig(["ventas.garantia_texto"]);
  bloques.push({ tipo: "texto", texto: v.garantiaMeses ? `Válida hasta el ${fecha(hasta)}. ${cfg["ventas.garantia_texto"]}` : "Pieza sin garantía." });
  bloques.push({ tipo: "firma", textos: ["María Castagno"] });
  return generarDocumento({ titulo: "Certificado de garantía", numero: String(v.numero).padStart(6, "0"), fecha: v.fecha, bloques });
}

export async function pdfPresupuesto(id: number) {
  const p = await obtenerPresupuesto(id);
  if (!p) return null;
  return generarDocumento({
    titulo: "Presupuesto",
    numero: String(p.numero).padStart(6, "0"),
    fecha: p.fecha,
    leyenda: NO_FACTURA,
    bloques: [
      { tipo: "datos", filas: [["Cliente", p.cliente ?? "—"], ["Válido hasta", fecha(p.vence)]] },
      { tipo: "tabla", columnas: [{ titulo: "Descripción", ancho: 70 }, { titulo: "Cant.", ancho: 10, derecha: true }, { titulo: "Importe", ancho: 20, derecha: true }], filas: p.renglones.map((r) => [r.descripcion, String(r.cantidad), $(r.subtotal)]) },
      { tipo: "totales", filas: [...(p.descuentoPct ? [[`Descuento ${p.descuentoPct / 100} %`, ""] as [string, string]] : []), ["Total", $(p.total), true]] },
      { tipo: "texto", chico: true, texto: "Los precios de las piezas de oro y plata dependen de la cotización del metal y del dólar: este presupuesto se respeta hasta la fecha indicada." },
      ...(p.notas ? [{ tipo: "texto" as const, texto: p.notas }] : []),
    ],
  });
}

export async function pdfReparacion(id: number) {
  const r = await obtenerReparacion(id);
  if (!r) return null;
  const cfg = await leerConfig(["reparaciones.condiciones"]);
  return generarDocumento({
    titulo: "Recepción de reparación",
    numero: String(r.numero).padStart(5, "0"),
    fecha: r.fechaIngreso,
    bloques: [
      ...datosCliente(r.cliente),
      { tipo: "titulo", texto: "Pieza recibida" },
      {
        tipo: "datos",
        filas: [
          ["Pieza", r.descripcion],
          ["Trabajo", r.trabajos.map((t) => TRABAJOS[t]).join(", ")],
          ...(r.detalle ? [["Detalle", r.detalle] as [string, string]] : []),
          ...(r.pesoIngresoMg != null ? [["Peso al ingreso", gramos(r.pesoIngresoMg)!] as [string, string]] : []),
          ...(r.presupuesto != null ? [["Presupuesto", $(r.presupuesto)] as [string, string]] : []),
          ...(r.fechaPrometida ? [["Fecha prometida", fecha(r.fechaPrometida)] as [string, string]] : []),
        ],
      },
      { tipo: "texto", chico: true, texto: cfg["reparaciones.condiciones"] },
      { tipo: "firma", textos: ["Firma del cliente", "Recibió (María Castagno)"] },
    ],
  });
}

export async function pdfPedido(id: number) {
  const p = await obtenerPedido(id);
  if (!p) return null;
  return generarDocumento({
    titulo: "Pedido a medida",
    numero: String(p.numero).padStart(5, "0"),
    fecha: p.fecha,
    leyenda: NO_FACTURA,
    bloques: [
      ...datosCliente(p.cliente),
      { tipo: "titulo", texto: "Pedido" },
      {
        tipo: "datos",
        filas: [
          ["Descripción", p.descripcion],
          ...(p.ley ? [["Metal", p.ley] as [string, string]] : []),
          ...(p.piedras ? [["Piedras", p.piedras] as [string, string]] : []),
          ...(p.talle ? [["Talle", p.talle] as [string, string]] : []),
          ["Precio", p.modoPrecio === "congelado" ? `${$(p.presupuesto)} (precio pactado)` : `Gramos finales × valor del gramo el día de la entrega + hechura ${$(p.hechura)}${p.gramosEstimadosMg ? ` (estimado ${gramos(p.gramosEstimadosMg)})` : ""}`],
          ...(p.entregaEstimada ? [["Entrega estimada", fecha(p.entregaEstimada)] as [string, string]] : []),
        ],
      },
      ...(p.notas ? [{ tipo: "texto" as const, texto: p.notas }] : []),
      { tipo: "firma", textos: ["Firma del cliente", "María Castagno"] },
    ],
  });
}

/** Tarea diaria: reintenta los comprobantes pendientes y avisa si quedan pendientes o rechazados. */
import { eq, inArray } from "drizzle-orm";
import { comprobantesFiscales, db } from "@/db";
import { crearAlerta } from "../alertas";
import { SISTEMA } from "../auditoria";
import { reintentarPendientes } from "./emision";

export async function avisosFacturacion(hoy: string) {
  const pend = await db.select({ id: comprobantesFiscales.id }).from(comprobantesFiscales).where(eq(comprobantesFiscales.estado, "pendiente"));
  if (pend.length) await reintentarPendientes(SISTEMA);
  const quedan = await db.select().from(comprobantesFiscales).where(inArray(comprobantesFiscales.estado, ["pendiente", "rechazado"]));
  const reales = quedan.filter((c) => !(c.errores ?? "").startsWith("Venta anulada"));
  if (reales.length) await crearAlerta({ tipo: "facturacion", nivel: "alerta", titulo: `${reales.length} comprobante/s sin autorizar en ARCA`, detalle: "Revisalos en Facturación → Pendientes y rechazados.", clave: `facturacion:${hoy}` });
}

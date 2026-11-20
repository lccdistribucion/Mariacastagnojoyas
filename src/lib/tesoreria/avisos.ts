/** Avisos diarios de tesorería: tarjetas sin acreditar, cheques por cobrar o debitar y cajas sin cerrar. */
import { and, eq, inArray, lt, lte } from "drizzle-orm";
import { acreditaciones, cheques, db, type Tx } from "@/db";
import { crearAlerta } from "../alertas";
import { avisarCajasSinCerrar } from "./arqueos";

export async function avisosTesoreria(hoy: string) {
  await avisarCajasSinCerrar(hoy);
  const ayer = new Date(Date.now() - 86400_000);
  const atrasadas = await db.select().from(acreditaciones).where(and(eq(acreditaciones.estado, "pendiente"), lt(acreditaciones.fechaEsperada, ayer)));
  if (atrasadas.length) await crearAlerta({ tipo: "tarjeta_sin_acreditar", nivel: "alerta", titulo: `${atrasadas.length} cobro/s con tarjeta pasaron la fecha esperada de acreditación`, detalle: "Revisalos en Tesorería → Tarjetas.", clave: `tarjetas:${hoy}` });
  const en3 = new Date(Date.now() + 3 * 86400_000);
  const ch = await db.select().from(cheques).where(and(inArray(cheques.estado, ["en_cartera", "emitido"]), lte(cheques.fechaPago, en3)));
  const cobrar = ch.filter((c) => c.tipo === "tercero").length;
  const debitar = ch.filter((c) => c.tipo === "propio").length;
  if (cobrar || debitar) await crearAlerta({ tipo: "cheques", nivel: "info", titulo: [cobrar && `${cobrar} cheque/s para depositar`, debitar && `${debitar} cheque/s propio/s que se debitan`].filter(Boolean).join(" y ") + " en los próximos 3 días", detalle: "Revisalos en Tesorería → Cheques.", clave: `cheques:${hoy}` });
}

/** Al quitar los datos de ejemplo: borra los movimientos y acreditaciones que quedaron sin su operación. */
export async function limpiarHuerfanosTesoreria(tx: Tx) {
  const { sql } = await import("drizzle-orm");
  await tx.run(sql`delete from movimientos_caja where referencia like 'cobro:%' and cast(substr(referencia, 7) as integer) not in (select id from cobros)`);
  await tx.run(sql`delete from movimientos_caja where referencia like 'devolucion:%' and cast(substr(referencia, 12) as integer) not in (select id from devoluciones)`);
  await tx.run(sql`delete from movimientos_caja where referencia like 'pago:%' and cast(substr(referencia, 6) as integer) not in (select id from pagos_proveedores)`);
  await tx.run(sql`delete from movimientos_caja where referencia like 'cheque:%' and cast(substr(referencia, 8) as integer) not in (select id from cheques)`);
  await tx.run(sql`delete from movimientos_caja where referencia like 'reintegro_cc:%' and cast(substr(referencia, 14) as integer) not in (select id from movimientos_cc_clientes)`);
  await tx.run(sql`delete from acreditaciones where cobro_id not in (select id from cobros)`);
}

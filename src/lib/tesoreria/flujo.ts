/**
 * Flujo de fondos: proyección de lo que va a entrar y salir, por semana o por mes, en pesos.
 * Entradas: tarjetas a acreditar (neto estimado), cheques en cartera, cuotas de clientes en cuenta corriente.
 * Salidas: facturas de proveedores pendientes y cheques propios sin debitar.
 * Lo que ya venció y no se cobró/pagó aparece aparte («Vencido»). Las divisas se pasan a pesos con la cotización de hoy.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { acreditaciones, cajas, cheques, clientes, compras, db, movimientosCcClientes, proveedores } from "@/db";
import { hoyIso, inicioDelDia } from "../formato";
import { cambiosDelDia, listarCajas } from "./cajas";

export type Partida = { fecha: Date; concepto: string; importe: number; tipo: "tarjeta" | "cheque_tercero" | "cliente" | "proveedor" | "cheque_propio" };

export async function partidasPendientes(): Promise<Partida[]> {
  const out: Partida[] = [];
  const tc = await cambiosDelDia();

  const acs = await db.select({ a: acreditaciones, comision: cajas.comisionPct, retencion: cajas.retencionPct }).from(acreditaciones).innerJoin(cajas, eq(cajas.id, acreditaciones.cajaId)).where(eq(acreditaciones.estado, "pendiente"));
  for (const { a, comision, retencion } of acs) out.push({ fecha: a.fechaEsperada, concepto: "Tarjetas a acreditar (neto estimado)", importe: Math.round(a.bruto * (1 - (comision + retencion) / 10000)), tipo: "tarjeta" });

  for (const c of await db.select().from(cheques).where(inArray(cheques.estado, ["en_cartera", "emitido"]))) {
    if (c.tipo === "tercero") out.push({ fecha: c.fechaPago, concepto: `Cheque N.º ${c.numero} (${c.banco}) en cartera`, importe: c.importe, tipo: "cheque_tercero" });
    else out.push({ fecha: c.fechaPago, concepto: `Cheque propio N.º ${c.numero}`, importe: -c.importe, tipo: "cheque_propio" });
  }

  // Clientes: lo cobrado cancela primero lo más viejo; lo que queda se espera para su vencimiento.
  const movs = await db
    .select({ m: movimientosCcClientes, nombre: clientes.nombre })
    .from(movimientosCcClientes)
    .innerJoin(clientes, eq(clientes.id, movimientosCcClientes.clienteId))
    .where(eq(movimientosCcClientes.anulado, false))
    .orderBy(movimientosCcClientes.clienteId, sql`coalesce(${movimientosCcClientes.vencimiento}, ${movimientosCcClientes.fecha})`);
  const porCliente = new Map<number, typeof movs>();
  for (const x of movs) porCliente.set(x.m.clienteId, [...(porCliente.get(x.m.clienteId) ?? []), x]);
  for (const lista of porCliente.values()) {
    let credito = -lista.filter((x) => x.m.importe < 0).reduce((s, x) => s + x.m.importe, 0);
    for (const x of lista.filter((y) => y.m.importe > 0)) {
      const usa = Math.min(credito, x.m.importe);
      credito -= usa;
      const resta = x.m.importe - usa;
      if (resta > 0) out.push({ fecha: x.m.vencimiento ?? x.m.fecha, concepto: `${x.nombre}: ${x.m.descripcion}`, importe: resta, tipo: "cliente" });
    }
  }

  // Proveedores: facturas con saldo pendiente (total − pagos imputados).
  const comp = await db
    .select({
      c: compras,
      prov: proveedores.razonSocial,
      pagado: sql<number>`coalesce((select sum(i.importe) from pago_imputaciones i join pagos_proveedores p on p.id = i.pago_id where i.compra_id = "compras"."id" and p.anulado = 0), 0)`,
    })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .where(and(eq(compras.anulada, false), eq(compras.condicion, "cuenta_corriente")));
  for (const { c, prov, pagado } of comp) {
    const pendiente = c.total - pagado;
    if (pendiente <= 0) continue;
    const cambio = tc[c.moneda] ?? 0;
    out.push({ fecha: c.vencimiento ?? c.fecha, concepto: `${prov}: factura${c.numero ? ` N.º ${c.numero}` : ""}${c.moneda !== "ARS" ? ` (${c.moneda} ${(pendiente / 100).toLocaleString("es-AR")})` : ""}`, importe: -Math.round(pendiente * cambio), tipo: "proveedor" });
  }
  return out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/** Agrupa por semana (lunes) o por mes, con «Vencido» primero y el saldo acumulado partiendo del disponible de hoy. */
export async function flujoDeFondos(periodo: "semana" | "mes", cantidad = periodo === "semana" ? 8 : 6) {
  const partidas = await partidasPendientes();
  const hoy = inicioDelDia(hoyIso());
  const cajasL = await listarCajas();
  // Disponible: efectivo, bancos y billeteras (las tarjetas y los cheques entran como partidas).
  const disponible = cajasL.filter((c) => ["efectivo", "banco", "billetera"].includes(c.tipo)).reduce((s, c) => s + (c.enPesos ?? 0), 0);
  const inicioPeriodo = (d: Date) => {
    const x = new Date(d);
    if (periodo === "mes") return new Date(x.getFullYear(), x.getMonth(), 1);
    const dia = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dia);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const base = inicioPeriodo(hoy);
  const tramos: { desde: Date; hasta: Date; etiqueta: string; entradas: number; salidas: number; partidas: Partida[] }[] = [];
  for (let i = 0; i < cantidad; i++) {
    const desde = new Date(base);
    if (periodo === "mes") desde.setMonth(base.getMonth() + i);
    else desde.setDate(base.getDate() + i * 7);
    const hasta = new Date(desde);
    if (periodo === "mes") hasta.setMonth(desde.getMonth() + 1);
    else hasta.setDate(desde.getDate() + 7);
    const etiqueta = periodo === "mes" ? desde.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : `Semana del ${desde.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}`;
    tramos.push({ desde, hasta, etiqueta, entradas: 0, salidas: 0, partidas: [] });
  }
  const vencido = { entradas: 0, salidas: 0, partidas: [] as Partida[] };
  const despues = { entradas: 0, salidas: 0, partidas: [] as Partida[] };
  for (const p of partidas) {
    const destino = p.fecha < hoy ? vencido : (tramos.find((t) => p.fecha >= t.desde && p.fecha < t.hasta) ?? (p.fecha < tramos[0].desde ? tramos[0] : despues));
    destino.partidas.push(p);
    if (p.importe > 0) destino.entradas += p.importe;
    else destino.salidas += -p.importe;
  }
  let saldo = disponible + vencido.entradas - vencido.salidas;
  const filas = tramos.map((t) => {
    saldo += t.entradas - t.salidas;
    return { ...t, saldo };
  });
  return { disponible, vencido, filas, despues };
}

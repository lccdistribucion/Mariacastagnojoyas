"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { registrarCobroCliente, type PagoIn } from "@/lib/ventas/cobros";
import { anularVenta, registrarDevolucion } from "@/lib/ventas/motor";
import { anularPresupuesto } from "@/lib/ventas/presupuestos";
import { cerrarReserva } from "@/lib/ventas/reservas";
import { consultarVale } from "@/lib/ventas/vales";
import { comprobantesDeVenta, notaCredito } from "@/lib/facturacion/emision";
import { resultadoFiscal } from "@/lib/facturacion/vista";
import { leerNumero } from "@/lib/formato";
import { devolverSaldoCliente } from "@/lib/tesoreria/reintegros";

export type Estado = { ok?: string; error?: string } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function intentar(fn: () => Promise<string>): Promise<Estado> {
  try {
    return { ok: await fn() };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function accionAnularVenta(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("anular_comprobantes");
  const id = Number(txt(f, "ventaId"));
  const r = await intentar(async () => {
    await anularVenta(id, txt(f, "motivo"), await actorDe(u));
    return "Venta anulada: las piezas volvieron al stock y se revirtieron los cobros.";
  });
  revalidatePath(`/ventas/${id}`);
  return r;
}

export async function accionDevolucion(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("anular_comprobantes");
  const id = Number(txt(f, "ventaId"));
  const items = f
    .getAll("item")
    .map(String)
    .map((itemId) => ({ itemId: Number(itemId), cantidad: Number(txt(f, `cant_${itemId}`)) || 1 }));
  const r = await intentar(async () => {
    const actor = await actorDe(u);
    const d = await registrarDevolucion(id, { items, forma: txt(f, "forma") as "vale" | "cuenta_corriente" | "reintegro", motivo: txt(f, "motivo"), cajaId: Number(txt(f, "cajaId")) || null }, actor);
    const $ = `$ ${(d.importe / 100).toLocaleString("es-AR")}`;
    const base = d.valeCodigo ? `Devolución registrada. Vale de cambio ${d.valeCodigo} por ${$}.` : `Devolución registrada por ${$}.`;
    // Si la venta estaba facturada, va la nota de crédito por lo devuelto.
    const fiscal = (await comprobantesDeVenta(id)).find((c) => [1, 6, 11].includes(c.tipo) && c.estado === "autorizado");
    if (!fiscal) return base;
    const nc = await notaCredito({ facturaId: fiscal.id, importe: Math.min(d.importe, fiscal.total), motivo: `Devolución: ${txt(f, "motivo")}` }, actor).catch((e) => ({ estado: "error", errores: String((e as Error).message) }) as const);
    const r = "tipo" in nc ? resultadoFiscal(nc) : { error: nc.errores };
    return `${base} ${r.ok ?? r.aviso ?? `No se pudo hacer la nota de crédito: ${r.error}`}`;
  });
  revalidatePath(`/ventas/${id}`);
  return r;
}

export async function accionAnularPresupuesto(f: FormData) {
  const u = await requiereUsuario();
  await anularPresupuesto(Number(f.get("id")), await actorDe(u));
  revalidatePath("/ventas/presupuestos");
}

export async function accionCancelarReserva(f: FormData) {
  const u = await requiereUsuario();
  await cerrarReserva(Number(f.get("id")), "cancelada", await actorDe(u));
  revalidatePath("/ventas/reservas");
}

export async function accionConsultarVale(_p: unknown, f: FormData) {
  await requiereUsuario();
  const v = await consultarVale(txt(f, "codigo"));
  if (!v) return { error: "No existe un vale o gift card con ese código." };
  return { vale: { codigo: v.codigo, tipo: v.tipo, monto: v.monto, saldo: v.saldo, vence: v.vence?.toISOString() ?? null, anulado: v.anulado } };
}

/** Cobro de cuenta corriente desde la ficha del cliente (con el panel de medios). */
export async function accionCobroCc(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const clienteId = Number(txt(f, "clienteId"));
  const r = await intentar(async () => {
    const pagos = JSON.parse(txt(f, "pagos") || "[]") as PagoIn[];
    const total = await registrarCobroCliente(clienteId, { origen: "cobro_cc", referencia: null, descripcion: txt(f, "detalle") || "Pago a cuenta", pagos }, await actorDe(u));
    return `Cobro registrado: $ ${(total / 100).toLocaleString("es-AR")}.`;
  });
  revalidatePath(`/clientes/${clienteId}`);
  return r;
}

/** Devolver dinero a un cliente con saldo a favor (por ejemplo, una seña de una reserva vencida). */
export async function accionDevolverSaldo(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("anular_comprobantes");
  const clienteId = Number(txt(f, "clienteId"));
  const r = await intentar(async () => {
    const importe = Math.round((leerNumero(txt(f, "importe")) ?? 0) * 100);
    await devolverSaldoCliente(clienteId, { importe, cajaId: Number(txt(f, "cajaId")), motivo: txt(f, "motivo") }, await actorDe(u));
    return "Listo: se registró la devolución del dinero.";
  });
  revalidatePath(`/clientes/${clienteId}`);
  return r;
}

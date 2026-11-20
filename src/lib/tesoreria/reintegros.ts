/** Devolver dinero a un cliente que tiene saldo a favor (por ejemplo, la seña de una reserva que venció). */
import { eq } from "drizzle-orm";
import { clientes, db, movimientosCcClientes } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { saldoCliente } from "../ventas/cobros";
import { formatoMoneda, movimiento } from "./cajas";

export async function devolverSaldoCliente(clienteId: number, d: { importe: number; cajaId: number; motivo: string }, actor: Actor) {
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new ErrorValidacion("Indicá el importe.");
  if (d.motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo.");
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
    if (!c) throw new ErrorValidacion("El cliente no existe.");
    const aFavor = -(await saldoCliente(clienteId, tx));
    if (aFavor < d.importe) throw new ErrorValidacion(`El cliente tiene ${formatoMoneda(Math.max(0, aFavor), "ARS")} a favor.`);
    const [m] = await tx.insert(movimientosCcClientes).values({ clienteId, fecha: new Date(), tipo: "ajuste", importe: d.importe, descripcion: `Se le devolvió dinero (${d.motivo.trim()})`, documento: "reintegro", usuarioId: actor.id }).returning({ id: movimientosCcClientes.id });
    await movimiento(tx, { cajaId: d.cajaId, tipo: "reintegro", importe: -d.importe, descripcion: `Devolución de saldo a favor a ${c.nombre} (${d.motivo.trim()})`, referencia: `reintegro_cc:${m.id}`, moneda: "ARS" }, actor);
    await auditar(tx, actor, { accion: "alta", entidad: "cliente", entidadId: clienteId, descripcion: `Devolvió ${formatoMoneda(d.importe, "ARS")} de saldo a favor a ${c.nombre} (${d.motivo.trim()})` });
  });
}

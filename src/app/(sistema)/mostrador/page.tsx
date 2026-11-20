import { eq } from "drizzle-orm";
import { clientes, db, leyesMetal } from "@/db";
import { requiereUsuario } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { listarListas } from "@/lib/stock/catalogos";
import { listarPedidos } from "@/lib/taller/pedidos";
import { listarReparaciones } from "@/lib/taller/reparaciones";
import { cotizacionesCobro, saldoCliente } from "@/lib/ventas/cobros";
import { listarMedios } from "@/lib/ventas/medios";
import { obtenerPresupuesto } from "@/lib/ventas/presupuestos";
import { listarReservas } from "@/lib/ventas/reservas";
import { piezasPorId } from "./acciones";
import { Mostrador, type Inicial } from "./mostrador";

export const metadata = { title: "Mostrador" };

export default async function PaginaMostrador({ searchParams }: { searchParams: Promise<{ pieza?: string; reserva?: string; presupuesto?: string; servicio?: string }> }) {
  const u = await requiereUsuario();
  const sp = await searchParams;
  const [medios, cot, listas, leyes, reps, peds, cfg] = await Promise.all([
    listarMedios(),
    cotizacionesCobro(),
    listarListas(),
    db.select({ id: leyesMetal.id, nombre: leyesMetal.nombre }).from(leyesMetal).where(eq(leyesMetal.activo, true)),
    listarReparaciones(["lista", "avisada", "en_taller", "recibida"]),
    listarPedidos(["listo", "en_taller", "aprobado"]),
    leerConfig(["reservas.dias", "ventas.garantia_meses"]),
  ]);
  const servicios = [
    ...reps.map((x) => ({ ref: `reparacion:${x.r.id}`, texto: `Reparación N.º ${x.r.numero} · ${x.cliente} · ${x.r.descripcion}`, clienteId: x.r.clienteId, listo: ["lista", "avisada"].includes(x.r.estado) })),
    ...peds.map((x) => ({ ref: `pedido:${x.p.id}`, texto: `Pedido N.º ${x.p.numero} · ${x.cliente} · ${x.p.descripcion}`, clienteId: x.p.clienteId, listo: x.p.estado === "listo" })),
  ];

  // Precarga: una pieza, una reserva para retirar, un presupuesto aceptado o un servicio para entregar.
  const inicial: Inicial = { piezas: [], clienteId: null, reservaId: null, presupuestoId: null, servicios: [], descuentoPct: 0, listaId: null };
  if (sp.pieza) inicial.piezas = (await piezasPorId([Number(sp.pieza)])).filter((p) => ["unica", "cantidad"].includes(p.tipo));
  if (sp.reserva) {
    const r = (await listarReservas(true)).find((x) => x.r.id === Number(sp.reserva));
    if (r) {
      inicial.reservaId = r.r.id;
      inicial.clienteId = r.r.clienteId;
      inicial.piezas = await piezasPorId(r.items.map((i) => i.i.productoId));
    }
  }
  if (sp.presupuesto) {
    const p = await obtenerPresupuesto(Number(sp.presupuesto));
    if (p && p.estado === "vigente") {
      inicial.presupuestoId = p.id;
      inicial.clienteId = p.clienteId;
      inicial.descuentoPct = p.descuentoPct;
      inicial.listaId = p.listaId;
      const ids = p.renglones.map((r) => r.productoId!).filter(Boolean);
      inicial.piezas = (await piezasPorId(ids)).map((x) => ({ ...x, cantidadInicial: p.renglones.find((r) => r.productoId === x.id)?.cantidad ?? 1 }));
    }
  }
  if (sp.servicio) {
    const s = servicios.find((x) => x.ref === sp.servicio);
    if (s) {
      inicial.servicios = [s.ref];
      inicial.clienteId = s.clienteId;
    }
  }
  let cliente = null;
  if (inicial.clienteId) {
    const [c] = await db.select().from(clientes).where(eq(clientes.id, inicial.clienteId));
    if (c) cliente = { id: c.id, nombre: c.nombre, documento: c.documento, saldo: await saldoCliente(c.id), whatsapp: c.whatsapp };
  }

  return (
    <Mostrador
      inicial={inicial}
      cliente={cliente}
      medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, moneda: m.moneda, ajustePct: m.ajustePct, planes: m.planes.map((p) => ({ cuotas: p.cuotas, recargoPct: p.recargoPct })) }))}
      cot={cot}
      listas={listas.filter((l) => l.activo).map((l) => ({ id: l.id, nombre: l.nombre }))}
      leyes={leyes}
      servicios={servicios}
      permisos={{ modificarPrecios: u.permisos.has("modificar_precios"), sinFacturar: u.permisos.has("cargar_sin_facturar") }}
      diasReserva={cfg["reservas.dias"]}
    />
  );
}

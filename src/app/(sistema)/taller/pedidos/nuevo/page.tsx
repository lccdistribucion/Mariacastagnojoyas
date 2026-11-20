import { asc, eq } from "drizzle-orm";
import { clientes, db, leyesMetal } from "@/db";
import { Encabezado } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { cotizacionesCobro } from "@/lib/ventas/cobros";
import { listarMedios } from "@/lib/ventas/medios";
import { FormPedido } from "./formulario";

export const metadata = { title: "Nuevo pedido a medida" };

export default async function NuevoPedido({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requiereUsuario();
  const cid = Number((await searchParams).cliente);
  const [medios, cot, leyes, c] = await Promise.all([
    listarMedios(),
    cotizacionesCobro(),
    db.select({ id: leyesMetal.id, nombre: leyesMetal.nombre }).from(leyesMetal).where(eq(leyesMetal.activo, true)).orderBy(asc(leyesMetal.orden)),
    cid ? db.select().from(clientes).where(eq(clientes.id, cid)) : Promise.resolve([]),
  ]);
  return (
    <>
      <Encabezado titulo="Nuevo pedido a medida" bajada="Si deja seña queda aprobado; si no, queda como presupuesto." />
      <FormPedido leyes={leyes} medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, moneda: m.moneda, ajustePct: m.ajustePct, planes: m.planes }))} cot={cot} cliente={c[0] ? { id: c[0].id, nombre: c[0].nombre, documento: c[0].documento } : null} />
    </>
  );
}

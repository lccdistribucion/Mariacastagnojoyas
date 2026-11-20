import { eq } from "drizzle-orm";
import { clientes, db } from "@/db";
import { Encabezado } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { TRABAJOS } from "@/lib/taller/reparaciones";
import { cotizacionesCobro } from "@/lib/ventas/cobros";
import { listarMedios } from "@/lib/ventas/medios";
import { FormReparacion } from "./formulario";

export const metadata = { title: "Recibir reparación" };

export default async function NuevaReparacion({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requiereUsuario();
  const cid = Number((await searchParams).cliente);
  const [medios, cot, c] = await Promise.all([listarMedios(), cotizacionesCobro(), cid ? db.select().from(clientes).where(eq(clientes.id, cid)) : Promise.resolve([])]);
  return (
    <>
      <Encabezado titulo="Recibir reparación" bajada="Se imprime el comprobante de recepción para que firme el cliente." />
      <FormReparacion
        trabajos={TRABAJOS}
        medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, moneda: m.moneda, ajustePct: m.ajustePct, planes: m.planes }))}
        cot={cot}
        cliente={c[0] ? { id: c[0].id, nombre: c[0].nombre, documento: c[0].documento } : null}
      />
    </>
  );
}

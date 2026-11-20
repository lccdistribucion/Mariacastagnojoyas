import Link from "next/link";
import { inArray } from "drizzle-orm";
import { comprobantesFiscales, db } from "@/db";
import { Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { fechaHora, numero } from "@/lib/formato";
import { NOMBRE_TIPO, numeroComprobante } from "@/lib/facturacion/calculo";
import { BotonFiscal } from "../../ventas/[id]/paneles";
import { ReintentarTodo } from "./panel";

export const metadata = { title: "Comprobantes pendientes" };

export default async function Pendientes() {
  const filas = await db.select().from(comprobantesFiscales).where(inArray(comprobantesFiscales.estado, ["pendiente", "rechazado"])).orderBy(comprobantesFiscales.creadoEn);
  const pend = filas.filter((c) => c.estado === "pendiente");
  const rech = filas.filter((c) => c.estado === "rechazado" && !(c.errores ?? "").startsWith("Venta anulada"));
  const lista = (xs: typeof filas) => (
    <ul className="divide-y divide-linea">
      {xs.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:px-5">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {NOMBRE_TIPO[c.tipo]} {c.numero ? numeroComprobante(c.puntoVenta, c.numero) : ""} · {c.receptor} · $ {numero(c.total / 100, 2)}
            {c.numero && c.estado === "pendiente" && <Etiqueta tono="alerta">Número pedido: no anular la venta hasta resolverlo</Etiqueta>}
          </span>
          <span className="text-xs text-gris">{c.intentos} intento/s{c.ultimoIntento ? ` · último ${fechaHora(c.ultimoIntento)}` : ""}{c.ventaId ? <> · <Link href={`/ventas/${c.ventaId}`} className="underline">ver venta</Link></> : null}</span>
          {c.errores && <span className="text-xs text-error">{c.errores}</span>}
          <div className="max-w-xs"><BotonFiscal que="reintentar" id={c.id} texto="Reintentar" /></div>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <Encabezado titulo="Pendientes y rechazados" bajada="Pendientes: ARCA no respondió (se reintentan solos todos los días). Rechazados: ARCA dijo que no; corregí el dato (por ejemplo el CUIT del cliente) y reintentá." acciones={pend.length ? <ReintentarTodo /> : undefined} />
      <div className="flex flex-col gap-5">
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-3 font-medium">Pendientes ({pend.length})</h2>
          {pend.length ? lista(pend) : <Vacio>No hay comprobantes pendientes.</Vacio>}
        </Tarjeta>
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-3 font-medium">Rechazados ({rech.length})</h2>
          {rech.length ? lista(rech) : <Vacio>No hay comprobantes rechazados.</Vacio>}
        </Tarjeta>
      </div>
    </>
  );
}

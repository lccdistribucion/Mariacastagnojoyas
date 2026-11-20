import Link from "next/link";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { clientes, db, ventas } from "@/db";
import { clasesBoton, Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { fecha, finDelDia, hoyIso, inicioDelDia, numero } from "@/lib/formato";
import { BotonFiscal } from "../../ventas/[id]/paneles";

export const metadata = { title: "Ventas sin facturar" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

export default async function SinFacturar({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const u = await requierePermiso("ver_sin_facturar");
  const sp = await searchParams;
  const desde = sp.desde ?? `${hoyIso().slice(0, 8)}01`;
  const hasta = sp.hasta ?? hoyIso();
  const rango = and(eq(ventas.anulada, false), gte(ventas.fecha, inicioDelDia(desde)), lte(ventas.fecha, finDelDia(hasta)));
  const [totales, internas] = await Promise.all([
    db.select({ tipo: ventas.tipoComprobante, n: sql<number>`count(*)`, t: sql<number>`coalesce(sum(${ventas.total} + ${ventas.recargos}), 0)` }).from(ventas).where(rango).groupBy(ventas.tipoComprobante),
    db.select({ v: ventas, cliente: clientes.nombre }).from(ventas).leftJoin(clientes, eq(clientes.id, ventas.clienteId)).where(and(rango, eq(ventas.tipoComprobante, "interno"))).orderBy(ventas.fecha),
  ]);
  const de = (t: string) => totales.find((x) => x.tipo === t) ?? { n: 0, t: 0 };
  const puede = u.permisos.has("cargar_sin_facturar");
  return (
    <>
      <Encabezado titulo="Ventas sin facturar" bajada="Ventas con comprobante interno: descuentan stock y entran en caja igual que las facturadas. Solo las ve quien tiene permiso. Se pueden facturar después sin duplicar nada." />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gris">Desde<input type="date" name="desde" defaultValue={desde} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Hasta<input type="date" name="hasta" defaultValue={hasta} className="campo" /></label>
          <button className={clasesBoton("primario")}>Ver</button>
        </form>
      </Tarjeta>
      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Con factura", de("factura")], ["Sin facturar", de("interno")], ["Total (consolidado)", { n: de("factura").n + de("interno").n, t: de("factura").t + de("interno").t }]].map(([t, x]) => (
          <Tarjeta key={t as string} className="p-4 sm:p-5">
            <p className="text-xs text-gris">{t as string}</p>
            <p className="titulo-serif mt-2 text-3xl tabular-nums">{$((x as { t: number }).t)}</p>
            <p className="text-xs text-gris">{(x as { n: number }).n} venta/s</p>
          </Tarjeta>
        ))}
      </section>
      <Tarjeta>
        {!internas.length ? (
          <Vacio>No hay ventas sin facturar en esas fechas.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {internas.map(({ v, cliente }) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 flex-1"><Link href={`/ventas/${v.id}`} className="font-medium hover:underline">N.º {String(v.numero).padStart(6, "0")}</Link><span className="block text-xs text-gris">{fecha(v.fecha)} · {cliente ?? "Consumidor final"}</span></span>
                <span className="tabular-nums">{$(v.total + v.recargos)}</span>
                {puede && <div className="w-full sm:w-auto"><BotonFiscal que="posteriori" id={v.id} texto="Facturar ahora" /></div>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

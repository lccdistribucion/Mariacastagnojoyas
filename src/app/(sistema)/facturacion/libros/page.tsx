import { clasesBoton, Encabezado, Tarjeta } from "@/components/ui";
import { hoyIso, numero } from "@/lib/formato";
import { libroCompras, libroVentas } from "@/lib/facturacion/libros";

export const metadata = { title: "Libros IVA" };
const $ = (c: number) => `$ ${numero(c / 100, 2)}`;

export default async function Libros({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const mes = (await searchParams).mes ?? hoyIso().slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const desde = new Date(`${mes}-01T00:00:00-03:00`);
  const hasta = new Date(new Date(`${a}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`).setMonth(m) - 1);
  const [ventasL, comprasL] = await Promise.all([libroVentas(desde, hasta), libroCompras(desde, hasta)]);
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const fila = (t: string, v: string) => <div className="flex justify-between gap-3 border-b border-linea py-2 text-sm last:border-0"><dt className="text-gris">{t}</dt><dd className="tabular-nums">{v}</dd></div>;
  return (
    <>
      <Encabezado titulo="Libros IVA" bajada="Resumen del mes y planillas para el contador. Ventas: comprobantes autorizados (las notas de crédito restan). Compras: facturas A, B y C de proveedores, en pesos." />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gris">Mes<input type="month" name="mes" defaultValue={mes} className="campo" /></label>
          <button className={clasesBoton("primario")}>Ver</button>
        </form>
      </Tarjeta>
      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <h2 className="mb-2 font-medium">IVA Ventas ({ventasL.length} comprobantes)</h2>
          <dl>
            {fila("Neto gravado", $(sum(ventasL, (x) => x.neto)))}
            {fila("IVA débito fiscal", $(sum(ventasL, (x) => x.iva)))}
            {fila("Exento y no gravado", $(sum(ventasL, (x) => x.exento + x.noGravado)))}
            {fila("Total", $(sum(ventasL, (x) => x.total)))}
          </dl>
          <a href={`/facturacion/libros/descargar?libro=ventas&mes=${mes}`} className={clasesBoton("secundario", "mt-4 w-full")}>Descargar Excel</a>
        </Tarjeta>
        <Tarjeta className="p-5">
          <h2 className="mb-2 font-medium">IVA Compras ({comprasL.length} facturas)</h2>
          <dl>
            {fila("Neto", $(sum(comprasL, (x) => x.neto)))}
            {fila("IVA crédito fiscal", $(sum(comprasL, (x) => x.iva)))}
            {fila("Percepciones", $(sum(comprasL, (x) => x.percIva + x.percIibb)))}
            {fila("Total", $(sum(comprasL, (x) => x.total)))}
          </dl>
          <a href={`/facturacion/libros/descargar?libro=compras&mes=${mes}`} className={clasesBoton("secundario", "mt-4 w-full")}>Descargar Excel</a>
        </Tarjeta>
      </div>
      <p className="mt-4 text-xs text-gris">Saldo técnico estimado del mes (débito − crédito): {$(sum(ventasL, (x) => x.iva) - sum(comprasL, (x) => x.iva))}. Es orientativo: la liquidación la hace el contador.</p>
    </>
  );
}

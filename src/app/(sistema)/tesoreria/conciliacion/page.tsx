import { Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { fecha } from "@/lib/formato";
import { formatoMoneda, listarCajas, listarCategorias, listarMovimientos } from "@/lib/tesoreria/cajas";
import { lineasPendientes } from "@/lib/tesoreria/conciliacion";
import { accionRegistrarLinea } from "../acciones";
import { PanelConciliacion } from "./panel";

export const metadata = { title: "Conciliación bancaria" };

export default async function Conciliacion({ searchParams }: { searchParams: Promise<{ banco?: string }> }) {
  const sp = await searchParams;
  const bancos = (await listarCajas()).filter((c) => c.tipo === "banco");
  const banco = bancos.find((b) => b.id === Number(sp.banco)) ?? bancos[0];
  if (!banco) return <Vacio>No hay cuentas bancarias (Tesorería → Cajas).</Vacio>;
  const [pend, cats, movs] = await Promise.all([lineasPendientes(banco.id), listarCategorias(), listarMovimientos({ cajaId: banco.id, limite: 2000 })]);
  const sinConciliar = movs.filter((x) => !x.m.conciliado);
  return (
    <>
      <Encabezado titulo="Conciliación bancaria" bajada="Descargá el extracto del home banking en Excel o CSV (columnas Fecha, Concepto e Importe, o Débito y Crédito) y subilo: el sistema propone las coincidencias y vos confirmás." />
      <PanelConciliacion bancos={bancos.map((b) => ({ id: b.id, nombre: b.nombre }))} bancoId={banco.id} />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-3 font-medium">En el banco y no en el sistema ({pend.length})</h2>
          {!pend.length ? (
            <Vacio>Nada pendiente.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {pend.map((l) => (
                <li key={l.id} className="flex flex-col gap-2 px-5 py-3 text-sm">
                  <span className="flex justify-between gap-3"><span>{fecha(l.fecha)} · {l.descripcion}</span><span className={`tabular-nums ${l.importe < 0 ? "text-error" : "text-ok"}`}>{formatoMoneda(l.importe, banco.moneda)}</span></span>
                  <form action={accionRegistrarLinea} className="flex gap-2">
                    <input type="hidden" name="lineaId" value={l.id} />
                    <select name="categoriaId" className="campo h-10 min-h-10 flex-1 py-1 text-sm" aria-label="Categoría">{cats.filter((c) => c.activa && c.tipo === (l.importe < 0 ? "gasto" : "ingreso")).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
                    <button className="min-h-10 rounded-lg border border-linea-fuerte px-3 text-sm">Registrar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-3 font-medium">En el sistema y todavía no conciliados ({sinConciliar.length})</h2>
          {!sinConciliar.length ? (
            <Vacio>Todo conciliado.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {sinConciliar.slice(0, 100).map(({ m }) => (
                <li key={m.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span>{fecha(m.fecha)} · {m.descripcion}</span><span className={`whitespace-nowrap tabular-nums ${m.importe < 0 ? "text-error" : "text-ok"}`}>{formatoMoneda(m.importe, banco.moneda)}</span></li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

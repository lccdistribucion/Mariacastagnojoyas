import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { fechaHora, finDelDia, hoyIso, inicioDelDia } from "@/lib/formato";
import { formatoMoneda, listarCajas, listarCategorias, listarMovimientos, saldoCaja, TIPOS_MOVIMIENTO } from "@/lib/tesoreria/cajas";
import { accionAnularMovimiento } from "../acciones";

export const metadata = { title: "Movimientos de caja" };
const MANUALES = ["gasto", "ingreso", "saldo_inicial", "transferencia", "cambio"];

export default async function Movimientos({ searchParams }: { searchParams: Promise<{ caja?: string; desde?: string; hasta?: string; tipo?: string; cat?: string; q?: string; anulados?: string }> }) {
  const sp = await searchParams;
  const desde = sp.desde ?? hoyIso(new Date(Date.now() - 30 * 86400_000));
  const hasta = sp.hasta ?? hoyIso();
  const cajaId = Number(sp.caja) || undefined;
  const [cajas, cats, filas] = await Promise.all([
    listarCajas(false),
    listarCategorias(),
    listarMovimientos({ cajaId, desde: inicioDelDia(desde), hasta: finDelDia(hasta), tipo: sp.tipo || undefined, categoriaId: Number(sp.cat) || undefined, texto: sp.q, anulados: sp.anulados === "1" }),
  ]);
  const caja = cajas.find((c) => c.id === cajaId);
  const saldoAl = caja ? await saldoCaja(caja.id, undefined, finDelDia(hasta)) : null;
  const entradas = filas.filter((f) => !f.m.anulado && f.m.importe > 0);
  const salidas = filas.filter((f) => !f.m.anulado && f.m.importe < 0);
  return (
    <>
      <Encabezado
        titulo={caja ? caja.nombre : "Movimientos"}
        bajada={caja ? `Saldo al ${hasta.split("-").reverse().join("/")}: ${formatoMoneda(saldoAl!, caja.moneda)}${caja.moneda === "ARS" ? "" : ` · entradas ${formatoMoneda(entradas.reduce((s, f) => s + f.m.importe, 0), caja.moneda)} · salidas ${formatoMoneda(-salidas.reduce((s, f) => s + f.m.importe, 0), caja.moneda)}`}` : "Todas las cajas. Elegí una para ver su saldo."}
        acciones={<Link href="/tesoreria" className={clasesBoton("secundario")}>Registrar gasto o transferencia</Link>}
      />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-gris">Caja<select name="caja" defaultValue={sp.caja ?? ""} className="campo"><option value="">Todas</option>{cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Desde<input type="date" name="desde" defaultValue={desde} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Hasta<input type="date" name="hasta" defaultValue={hasta} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Tipo<select name="tipo" defaultValue={sp.tipo ?? ""} className="campo"><option value="">Todos</option>{Object.entries(TIPOS_MOVIMIENTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Categoría<select name="cat" defaultValue={sp.cat ?? ""} className="campo"><option value="">Todas</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs text-gris sm:col-span-2">Texto<input type="search" name="q" defaultValue={sp.q} className="campo" placeholder="Detalle" /></label>
          <div className="flex flex-wrap items-end gap-2">
            <button className={clasesBoton("primario")}>Filtrar</button>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="anulados" value="1" defaultChecked={sp.anulados === "1"} className="size-4" /> Anulados</label>
          </div>
        </form>
      </Tarjeta>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay movimientos con esos filtros.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ m, caja: nombreCaja, moneda, categoria }) => (
              <li key={m.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5 ${m.anulado ? "text-gris line-through" : ""}`}>
                <span className="min-w-0 flex-1">
                  {m.descripcion}
                  <span className="flex flex-wrap items-center gap-2 text-xs text-gris no-underline">
                    {fechaHora(m.fecha)} · {TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}{categoria ? ` · ${categoria}` : ""}{cajaId ? "" : ` · ${nombreCaja}`}
                    {m.conciliado && <Etiqueta tono="ok">Conciliado</Etiqueta>}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={`whitespace-nowrap tabular-nums ${m.importe < 0 ? "text-error" : "text-ok"}`}>{m.importe > 0 ? "+" : "−"}{formatoMoneda(Math.abs(m.importe), moneda)}</span>
                  {!m.anulado && !m.conciliado && MANUALES.includes(m.tipo) && (
                    <form action={accionAnularMovimiento}><input type="hidden" name="id" value={m.id} /><button className="min-h-9 text-xs text-gris hover:text-error" aria-label={`Anular ${m.descripcion}`}>Anular</button></form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

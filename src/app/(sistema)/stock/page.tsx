import Link from "next/link";
import { BotonLink, clasesBoton, Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { IconoExcel, IconoMas, IconoPdf } from "@/components/iconos";
import { requiereUsuario } from "@/lib/auth/sesion";
import { listarLeyes } from "@/lib/cotizaciones/vigentes";
import { numero } from "@/lib/formato";
import { listarCategorias, listarUbicaciones } from "@/lib/stock/catalogos";
import { listarStock, valuacion } from "@/lib/stock/consultas";
import { ESTADOS, TIPOS } from "@/lib/stock/tipos";
import { leerFiltrosStock, queryStock } from "./filtros";
import { pesosEnteros, TarjetaPieza } from "./tarjeta-pieza";

export const metadata = { title: "Piezas y stock" };

export default async function Stock({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await requiereUsuario();
  const f = leerFiltrosStock(await searchParams);
  const [r, cats, ubis, leyes] = await Promise.all([listarStock(f), listarCategorias(), listarUbicaciones(), listarLeyes(true)]);
  const v = u.permisos.has("ver_costos") ? await valuacion({ ...f, pagina: undefined }, r.ctx) : null;
  const hayFiltros = !!(f.q || f.categoriaId || f.tipo || (f.estado && f.estado !== "stock") || f.ubicacionId || f.leyId || f.stockBajo);
  const sel = "campo";

  return (
    <>
      <Encabezado
        titulo="Piezas y stock"
        bajada={`${numero(r.total, 0)} ${r.total === 1 ? "pieza" : "piezas"}${hayFiltros ? " con estos filtros" : " en stock"}. Precios a la cotización de hoy.`}
        acciones={
          <>
            {u.permisos.has("cargar_productos") && <BotonLink href="/stock/nueva"><IconoMas className="size-4" /> Nueva pieza</BotonLink>}
            <a href={`/stock/exportar?${queryStock({ ...f, pagina: undefined }, { formato: "xlsx" })}`} className={clasesBoton("secundario")} aria-label="Exportar a Excel"><IconoExcel className="size-4" /> Excel</a>
            <a href={`/stock/exportar?${queryStock({ ...f, pagina: undefined }, { formato: "pdf" })}`} className={clasesBoton("secundario")} aria-label="Exportar a PDF"><IconoPdf className="size-4" /> PDF</a>
          </>
        }
      />

      {v && (
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Valuación del stock">
          {[
            { t: "Unidades", x: numero(v.unidades, 0) },
            { t: "Valor a costo", x: pesosEnteros(v.costo) },
            { t: "Valor a precio de venta", x: pesosEnteros(v.precio) },
            { t: "En consignación (no propias)", x: numero(v.consignacion, 0) },
          ].map((k) => (
            <Tarjeta key={k.t} className="px-3 py-2.5 sm:p-4">
              <p className="text-[0.7rem] text-gris sm:text-xs">{k.t}</p>
              <p className="titulo-serif text-xl tabular-nums sm:mt-1 sm:text-3xl">{k.x}</p>
            </Tarjeta>
          ))}
        </section>
      )}

      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input type="search" name="q" defaultValue={f.q} placeholder="Buscar por código, nombre, colección…" className={sel} autoComplete="off" aria-label="Buscar" />
            <button className={clasesBoton("primario")}>Buscar</button>
          </div>
          <details open={hayFiltros && !f.q} className="group">
            <summary className="cursor-pointer list-none text-sm text-gris hover:text-tinta">Más filtros {hayFiltros ? "(activos)" : ""} <span className="inline-block transition-transform group-open:rotate-180">▾</span></summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs text-gris">
                Categoría
                <select name="categoria" defaultValue={f.categoriaId ?? ""} className={sel}>
                  <option value="">Todas</option>
                  {cats.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gris">
                Metal / ley
                <select name="ley" defaultValue={f.leyId ?? ""} className={sel}>
                  <option value="">Todos</option>
                  {leyes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gris">
                Estado
                <select name="estado" defaultValue={f.estado === "stock" ? "" : f.estado} className={sel}>
                  <option value="">En stock</option>
                  {Object.entries(ESTADOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  <option value="todos">Todos (incluye vendidas)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gris">
                Ubicación
                <select name="ubicacion" defaultValue={f.ubicacionId ?? ""} className={sel}>
                  <option value="">Todas</option>
                  {ubis.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gris">
                Tipo
                <select name="tipo" defaultValue={f.tipo ?? ""} className={sel}>
                  <option value="">Todos</option>
                  {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="bajo" value="1" defaultChecked={f.stockBajo} className="size-4 accent-tinta" /> Solo stock bajo
              </label>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                <button className={clasesBoton("secundario")}>Aplicar filtros</button>
                {hayFiltros && <Link href="/stock" className={clasesBoton("fantasma")}>Limpiar</Link>}
              </div>
            </div>
          </details>
        </form>
      </Tarjeta>

      {r.filas.length === 0 ? (
        <Tarjeta><Vacio>No hay piezas para estos filtros.</Vacio></Tarjeta>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {r.filas.map((x) => <TarjetaPieza key={x.p.id} x={x} />)}
        </div>
      )}

      {r.paginas > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {r.pagina > 1 ? <Link href={`/stock?${queryStock({ ...f, pagina: r.pagina - 1 })}`} className={clasesBoton("secundario")}>← Anteriores</Link> : <span />}
          <span className="text-gris">Página {r.pagina} de {r.paginas}</span>
          {r.pagina < r.paginas ? <Link href={`/stock?${queryStock({ ...f, pagina: r.pagina + 1 })}`} className={clasesBoton("secundario")}>Siguientes →</Link> : <span />}
        </div>
      )}
    </>
  );
}

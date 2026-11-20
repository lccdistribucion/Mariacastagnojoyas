import Link from "next/link";
import { asc } from "drizzle-orm";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { IconoExcel, IconoPdf } from "@/components/iconos";
import { db, usuarios } from "@/db";
import { ACCIONES, ENTIDADES } from "@/lib/auditoria";
import { cambiosLegibles, consultarAuditoria } from "@/lib/auditoria-consulta";
import { requierePermiso } from "@/lib/auth/sesion";
import { fechaHora, numero } from "@/lib/formato";
import { aQuery, leerFiltros } from "./filtros";

export const metadata = { title: "Auditoría" };

const TONO: Record<string, "ok" | "alerta" | "error" | "neutro" | "champagne"> = {
  alta: "ok",
  modificacion: "champagne",
  desactivacion: "alerta",
  anulacion: "alerta",
  ingreso_fallido: "alerta",
  bloqueo: "error",
  autorizacion_rechazada: "error",
  autorizacion: "champagne",
};

export default async function Auditoria({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requierePermiso("ver_auditoria");
  const f = leerFiltros(await searchParams);
  const [{ filas, total, pagina, paginas }, gente] = await Promise.all([
    consultarAuditoria(f),
    db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).orderBy(asc(usuarios.nombre)),
  ]);
  const hayFiltros = !!(f.desde || f.hasta || f.usuarioId || f.accion || f.entidad || f.texto);

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        bajada="Todo lo que se hizo en el sistema: quién, cuándo y qué valor había antes. No se puede modificar ni borrar."
        acciones={
          <>
            <a href={`/auditoria/exportar?${aQuery({ ...f, pagina: undefined }, { formato: "xlsx" })}`} className={clasesBoton("secundario")}><IconoExcel className="size-4" /> Excel</a>
            <a href={`/auditoria/exportar?${aQuery({ ...f, pagina: undefined }, { formato: "pdf" })}`} className={clasesBoton("secundario")}><IconoPdf className="size-4" /> PDF</a>
          </>
        }
      />

      <Tarjeta className="mb-5 p-4 sm:p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
          <label className="flex flex-col gap-1 text-xs text-gris">Desde<input type="date" name="desde" defaultValue={f.desde} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Hasta<input type="date" name="hasta" defaultValue={f.hasta} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">
            Usuario
            <select name="usuarioId" defaultValue={f.usuarioId ?? ""} className="campo">
              <option value="">Todos</option>
              {gente.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gris">
            Acción
            <select name="accion" defaultValue={f.accion ?? ""} className="campo">
              <option value="">Todas</option>
              {Object.entries(ACCIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gris">
            Sección
            <select name="entidad" defaultValue={f.entidad ?? ""} className="campo">
              <option value="">Todas</option>
              {Object.entries(ENTIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gris">Buscar<input type="search" name="texto" defaultValue={f.texto} placeholder="Texto…" className="campo" /></label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <button className={clasesBoton("primario")}>Filtrar</button>
            {hayFiltros && <Link href="/auditoria" className={clasesBoton("fantasma")}>Limpiar</Link>}
            <span className="ml-auto self-center text-sm text-gris">{numero(total, 0)} movimientos</span>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta>
        {filas.length === 0 ? (
          <Vacio>No hay movimientos para estos filtros.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map((e) => {
              const cambios = cambiosLegibles(e.antes, e.despues);
              return (
                <li key={e.id}>
                  <details className="group">
                    <summary className={`flex cursor-pointer list-none flex-col gap-1.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${cambios.length ? "hover:bg-papel/60" : "cursor-default"}`}>
                      <span className="shrink-0 whitespace-nowrap text-xs text-gris sm:w-36 sm:text-sm">{fechaHora(e.fecha)}</span>
                      <span className="w-28 shrink-0"><Etiqueta tono={TONO[e.accion] ?? "neutro"}>{ACCIONES[e.accion as keyof typeof ACCIONES] ?? e.accion}</Etiqueta></span>
                      <span className="flex-1 text-sm">{e.descripcion}</span>
                      <span className="shrink-0 text-xs text-gris sm:w-36 sm:text-right">{e.usuarioNombre}</span>
                      {cambios.length > 0 && <span className="hidden text-xs text-champagne group-open:rotate-180 sm:inline">▾</span>}
                    </summary>
                    {cambios.length > 0 && (
                      <div className="overflow-x-auto px-4 pb-4 sm:px-5">
                        <table className="w-full min-w-[420px] rounded-lg border border-linea text-sm">
                          <thead className="bg-papel text-left text-xs text-gris">
                            <tr><th className="px-3 py-2 font-medium">Campo</th><th className="px-3 py-2 font-medium">Antes</th><th className="px-3 py-2 font-medium">Después</th></tr>
                          </thead>
                          <tbody className="divide-y divide-linea">
                            {cambios.map((c) => (
                              <tr key={c.campo}>
                                <td className="px-3 py-2 text-tinta-suave">{c.campo}</td>
                                <td className="px-3 py-2 text-error/80 line-through decoration-error/30">{c.antes ?? "—"}</td>
                                <td className="px-3 py-2 text-ok">{c.despues ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {e.ip && <p className="mt-2 text-xs text-gris">Desde el equipo {e.ip}</p>}
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        {paginas > 1 && (
          <div className="flex items-center justify-between border-t border-linea px-5 py-3 text-sm">
            {pagina > 1 ? <Link href={`/auditoria?${aQuery(f, { pagina: pagina - 1 })}`} className="text-gris hover:text-tinta">← Anteriores</Link> : <span />}
            <span className="text-gris">Página {pagina} de {paginas}</span>
            {pagina < paginas ? <Link href={`/auditoria?${aQuery(f, { pagina: pagina + 1 })}`} className="text-gris hover:text-tinta">Siguientes →</Link> : <span />}
          </div>
        )}
      </Tarjeta>
    </>
  );
}

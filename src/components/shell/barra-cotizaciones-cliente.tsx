"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { actualizarAhora } from "@/app/(sistema)/cotizaciones/acciones";
import { EstadoCotizacion, Punto } from "@/components/estado-cotizacion";
import type { ResumenCotizaciones, Vigente } from "@/lib/cotizaciones/vigentes";
import { fechaHora, hora, hoyIso, numero } from "@/lib/formato";

const CLAVE = "mc:dolar-barra";

/** $ 1.605 (sin decimales si es entero; si no, con dos). */
export const ars = (v: number | null | undefined) => (v == null ? "—" : `$ ${numero(v, Number.isInteger(v) ? 0 : 2)}`);
const usd = (v: number | null | undefined) => (v == null ? "—" : `US$ ${numero(v, 2)}`);
const cuando = (ms: number | null) => (ms == null ? "—" : hoyIso(new Date(ms)) === hoyIso() ? hora(ms) : fechaHora(ms));

export function BarraCotizacionesCliente({ r, puedeActualizar }: { r: ResumenCotizaciones; puedeActualizar: boolean }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>(r.referencia);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<{ ok?: string; error?: string } | undefined>();
  const [pendiente, iniciar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);

  // El tipo de dólar elegido se recuerda en este equipo (comodidad: no cambia nada para los demás).
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado && r.dolares.some((d) => d.codigo === guardado)) setTipo(guardado);
    } catch {}
  }, [r.dolares]);
  // Refresca los valores cada 5 minutos mientras la pantalla está a la vista.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 5 * 60_000);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const dolar = r.dolares.find((d) => d.codigo === tipo) ?? r.dolares[0];
  const elegir = (c: string) => {
    setTipo(c);
    try {
      localStorage.setItem(CLAVE, c);
    } catch {}
  };

  const item = (etiqueta: React.ReactNode, valor: React.ReactNode, v: { estado: Vigente["estado"]; fuenteNombre?: string | null; fecha?: number | null }) => (
    <span className="flex items-center gap-1.5" title={`${v.fuenteNombre ? `Fuente: ${v.fuenteNombre} · ` : ""}${v.fecha ? `Actualizado: ${fechaHora(v.fecha)}` : "Sin datos"}`}>
      <Punto estado={v.estado} className="size-1.5" />
      <span className="text-gris">{etiqueta}</span>
      <span className="font-medium text-tinta">{valor}</span>
    </span>
  );

  const fila = (v: Vigente, opciones: { metal?: boolean; referencia?: boolean } = {}) => (
    <tr key={v.codigo} className="border-t border-linea">
      <td className="py-2 pr-3">
        {v.nombre}
        {opciones.referencia && <span className="ml-2 rounded-full bg-champagne-suave px-2 py-0.5 text-[0.65rem] text-[#7a6340]">Referencia</span>}
      </td>
      <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{opciones.metal ? "" : ars(v.compra)}</td>
      <td className="py-2 pr-3 text-right font-medium whitespace-nowrap tabular-nums">{opciones.metal ? usd(v.venta) : ars(v.venta)}</td>
      <td className="hidden py-2 pr-3 text-gris sm:table-cell">{v.fuenteNombre ?? "—"}</td>
      <td className="py-2 pr-3 text-gris">{cuando(v.fecha)}</td>
      <td className="py-2"><EstadoCotizacion estado={v.estado} /></td>
    </tr>
  );

  return (
    <div ref={caja} className="sticky top-14 z-30 border-b border-linea bg-superficie/95 backdrop-blur lg:top-0" data-barra-cotizaciones>
      <div className="flex h-11 items-center text-xs">
        <button
          onClick={() => setAbierto((a) => !a)}
          className="flex h-full shrink-0 items-center gap-1.5 border-r border-linea px-3 text-gris hover:text-tinta sm:px-4"
          aria-expanded={abierto}
          aria-label="Ver detalle de cotizaciones"
        >
          <Punto estado={r.estadoGeneral} />
          <span className="hidden sm:inline">Cotizaciones</span>
          <span className="tabular-nums">{r.ultimaActualizacion ? cuando(r.ultimaActualizacion.fecha) : "—"}</span>
          <span className={`transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>
        <div className="flex h-full min-w-0 flex-1 items-center gap-5 overflow-x-auto px-3 whitespace-nowrap sm:px-5 [scrollbar-width:none]">
          {item(
            <span className="flex items-center gap-1">
              Dólar
              {/* Selector nativo invisible encima del texto: ocupa solo lo que dice (y en el celular abre la lista del sistema). */}
              <span className="relative inline-flex items-center gap-0.5 rounded px-0.5 text-tinta-suave underline decoration-dotted underline-offset-2 hover:text-tinta">
                {(r.dolares.find((d) => d.codigo === tipo) ?? r.dolares[0]).nombre.replace("Dólar ", "")}
                <span aria-hidden className="text-[0.6rem]">▾</span>
                <select value={tipo} onChange={(e) => elegir(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Tipo de dólar">
                  {r.dolares.map((d) => (
                    <option key={d.codigo} value={d.codigo}>{d.nombre.replace("Dólar ", "")}</option>
                  ))}
                </select>
              </span>
            </span>,
            <span className="tabular-nums">{ars(dolar.compra)} <span className="text-gris">/</span> {ars(dolar.venta)}</span>,
            dolar,
          )}
          {item("Euro", <span className="tabular-nums">{ars(r.euro.compra)} <span className="text-gris">/</span> {ars(r.euro.venta)}</span>, r.euro)}
          {item("Onza oro", <span className="tabular-nums">{usd(r.onzaOro.venta)}</span>, r.onzaOro)}
          {r.gramos.map((g) => (
            <span key={g.etiqueta}>{item(<span title={g.nombre}>{g.etiqueta} /g</span>, <span className="tabular-nums">{ars(g.mercado == null ? null : Math.round(g.mercado))}</span>, { estado: g.estado })}</span>
          ))}
        </div>
      </div>

      {abierto && (
        <div className="absolute inset-x-0 top-full max-h-[75dvh] overflow-y-auto border-b border-linea bg-superficie shadow-suave" role="dialog" aria-label="Detalle de cotizaciones">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-gris">
                  <tr>
                    <th className="pb-2 font-normal">Cotización</th>
                    <th className="pb-2 pr-3 text-right font-normal">Compra</th>
                    <th className="pb-2 pr-3 text-right font-normal">Venta</th>
                    <th className="hidden pb-2 font-normal sm:table-cell">Fuente</th>
                    <th className="pb-2 font-normal">Actualizada</th>
                    <th className="pb-2 font-normal">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.dolares.map((d) => fila(d, { referencia: d.codigo === r.referencia }))}
                  {fila(r.euro)}
                  {fila(r.euroBlue)}
                  {fila(r.onzaOro, { metal: true })}
                  {fila(r.onzaPlata, { metal: true })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gris">
              El oro se pasa a pesos con el dólar de referencia del negocio. Precio del gramo por ley, con ajustes de venta y de compra, en Cotizaciones.
            </p>
            {aviso?.ok && <p className="mt-3 text-sm text-ok" role="status">{aviso.ok}</p>}
            {aviso?.error && <p className="mt-3 text-sm text-error" role="alert">{aviso.error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {puedeActualizar && (
                <button
                  disabled={pendiente}
                  onClick={() =>
                    iniciar(async () => {
                      setAviso(await actualizarAhora());
                      router.refresh();
                    })
                  }
                  className="min-h-11 rounded-lg bg-tinta px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pendiente ? "Actualizando…" : "Actualizar ahora"}
                </button>
              )}
              <Link href="/cotizaciones" onClick={() => setAbierto(false)} className="flex min-h-11 items-center rounded-lg border border-linea-fuerte px-4 text-sm">
                Ver precios por ley e historial
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

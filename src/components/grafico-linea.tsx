"use client";
/**
 * Gráfico de evolución de UNA serie (dólar, euro, onza, gramo de oro). Línea fina de 2 px en tinta, grilla
 * tenue, valor actual grande con su variación en el período, y al pasar el dedo o el mouse una línea vertical
 * con la fecha y el valor. Debajo, «Ver tabla» con los datos (accesible y para copiar).
 */
import { useId, useMemo, useRef, useState } from "react";
import { numero } from "@/lib/formato";

export type PuntoSerie = { dia: string; valor: number };

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fechaLarga = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Marcas «redondas» del eje Y (1, 2, 2,5, 5 × 10^n). */
function marcas(min: number, max: number, cantidad = 4) {
  const rango = max - min || Math.abs(max) || 1;
  const paso0 = rango / cantidad;
  const pot = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= paso0) ?? 10 * pot;
  const desde = Math.floor(min / paso) * paso;
  const hasta = Math.ceil(max / paso) * paso;
  const out: number[] = [];
  for (let v = desde; v <= hasta + paso / 2; v += paso) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function GraficoLinea({
  titulo,
  serie,
  formato,
  decimales = 0,
  nota,
}: {
  titulo: string;
  serie: PuntoSerie[];
  formato: "ars" | "usd";
  decimales?: number;
  nota?: string;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const ANCHO = 600;
  const ALTO = 220;
  const M = { izq: 56, der: 12, arr: 12, aba: 26 };

  const g = useMemo(() => {
    if (serie.length < 2) return null;
    const vals = serie.map((p) => p.valor);
    const ticks = marcas(Math.min(...vals), Math.max(...vals));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const x = (i: number) => M.izq + (i / (serie.length - 1)) * (ANCHO - M.izq - M.der);
    const y = (v: number) => M.arr + (1 - (v - yMin) / (yMax - yMin || 1)) * (ALTO - M.arr - M.aba);
    const d = serie.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join("");
    const area = `${d}L${x(serie.length - 1).toFixed(1)},${ALTO - M.aba}L${M.izq},${ALTO - M.aba}Z`;
    const etiquetasX = [0, Math.floor((serie.length - 1) / 2), serie.length - 1];
    return { ticks, x, y, d, area, etiquetasX };
  }, [serie, M.izq, M.der, M.arr, M.aba]);

  const fmt = (v: number, dec = decimales) => `${formato === "usd" ? "US$" : "$"} ${numero(v, dec)}`;
  const fmtEje = (v: number) => (Math.abs(v) >= 10000 ? `${numero(v / 1000, v % 1000 ? 1 : 0)} mil` : numero(v, v % 1 ? 1 : 0));
  const ultimo = serie[serie.length - 1];
  const primero = serie[0];
  const variacion = ultimo && primero ? (ultimo.valor / primero.valor - 1) * 100 : null;

  const mover = (clientX: number) => {
    if (!g || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * ANCHO;
    const i = Math.round(((px - M.izq) / (ANCHO - M.izq - M.der)) * (serie.length - 1));
    setFoco(Math.max(0, Math.min(serie.length - 1, i)));
  };

  const p = foco != null ? serie[foco] : null;

  return (
    <figure className="flex flex-col rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:p-5">
      <figcaption>
        <p className="text-sm text-gris">{titulo}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className="titulo-serif text-3xl tabular-nums">{ultimo ? fmt(ultimo.valor) : "—"}</span>
          {variacion != null && (
            <span className="text-sm text-tinta-suave tabular-nums">
              {variacion >= 0 ? "▲" : "▼"} {numero(Math.abs(variacion), 1)} % <span className="text-gris">en el período</span>
            </span>
          )}
        </div>
      </figcaption>

      {!g ? (
        <p className="py-16 text-center text-sm text-gris">Todavía no hay datos suficientes para este período.</p>
      ) : (
        <div className="relative mt-3">
          <svg
            ref={svg}
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            className="w-full touch-pan-y select-none"
            role="img"
            aria-label={`${titulo}: de ${fmt(primero.valor)} el ${fechaLarga(primero.dia)} a ${fmt(ultimo.valor)} el ${fechaLarga(ultimo.dia)}`}
            onPointerMove={(e) => mover(e.clientX)}
            onPointerDown={(e) => mover(e.clientX)}
            onPointerLeave={() => setFoco(null)}
          >
            <defs>
              <linearGradient id={`${id}-relleno`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#151413" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#151413" stopOpacity="0" />
              </linearGradient>
            </defs>
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={M.izq} x2={ANCHO - M.der} y1={g.y(t)} y2={g.y(t)} stroke="#e6e1d9" strokeWidth="1" />
                <text x={M.izq - 8} y={g.y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#77716a">{fmtEje(t)}</text>
              </g>
            ))}
            {g.etiquetasX.map((i, k) => (
              <text key={i} x={g.x(i)} y={ALTO - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize="11" fill="#77716a">
                {fechaCorta(serie[i].dia)}
              </text>
            ))}
            <path d={g.area} fill={`url(#${id}-relleno)`} />
            <path d={g.d} fill="none" stroke="#151413" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {/* último valor */}
            <circle cx={g.x(serie.length - 1)} cy={g.y(ultimo.valor)} r="4" fill="#151413" stroke="#fff" strokeWidth="2" />
            {p && foco != null && (
              <g pointerEvents="none">
                <line x1={g.x(foco)} x2={g.x(foco)} y1={M.arr} y2={ALTO - M.aba} stroke="#a88a5a" strokeWidth="1" />
                <circle cx={g.x(foco)} cy={g.y(p.valor)} r="5" fill="#151413" stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>
          {p && foco != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg border border-linea bg-superficie px-3 py-2 text-xs shadow-suave"
              style={{ left: `${(g.x(foco) / ANCHO) * 100}%`, transform: `translateX(${foco > serie.length / 2 ? "calc(-100% - 10px)" : "10px"})` }}
              role="status"
            >
              <p className="text-gris">{fechaLarga(p.dia)}</p>
              <p className="font-medium tabular-nums">{fmt(p.valor, Math.max(decimales, 2))}</p>
            </div>
          )}
        </div>
      )}

      {nota && <p className="mt-2 text-xs text-gris">{nota}</p>}
      {serie.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-gris hover:text-tinta">Ver tabla</summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {[...serie].reverse().map((q) => (
                  <tr key={q.dia} className="border-t border-linea">
                    <td className="py-1 text-gris">{fechaLarga(q.dia)}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(q.valor, Math.max(decimales, 2))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

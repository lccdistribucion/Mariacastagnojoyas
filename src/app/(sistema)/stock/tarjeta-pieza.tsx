import Link from "next/link";
import { Etiqueta } from "@/components/ui";
import { IconoAnillo } from "@/components/iconos";
import { numero } from "@/lib/formato";
import { ESTADOS, type EstadoPieza } from "@/lib/stock/tipos";
import { resumenMetal, TONO_ESTADO } from "@/lib/stock/vista";
import type { listarStock } from "@/lib/stock/consultas";

type Fila = Awaited<ReturnType<typeof listarStock>>["filas"][number];

export const pesosEnteros = (c: number | null) => (c == null ? "—" : `$ ${numero(c / 100, 0)}`);

/** Tarjeta de una pieza para el listado: foto grande, código, nombre, metal y precio. */
export function TarjetaPieza({ x }: { x: Fila }) {
  const p = x.p;
  return (
    <Link href={`/stock/${p.id}`} className="group flex flex-col overflow-hidden rounded-xl border border-linea bg-superficie shadow-suave transition-colors hover:border-linea-fuerte">
      <div className="relative aspect-square bg-papel">
        {x.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/stock-foto?a=${encodeURIComponent(x.foto)}&mini=1`} alt={p.nombre} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-linea-fuerte">
            <IconoAnillo className="size-12" />
          </div>
        )}
        {p.estado !== "disponible" && (
          <span className="absolute top-2 left-2"><Etiqueta tono={TONO_ESTADO[p.estado] ?? "neutro"}>{ESTADOS[p.estado as EstadoPieza] ?? p.estado}</Etiqueta></span>
        )}
        {p.esDemo && <span className="absolute top-2 right-2 rounded bg-superficie/90 px-1.5 text-[0.6rem] tracking-wide text-gris uppercase">Ejemplo</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <span className="text-[0.7rem] tracking-wider text-gris">{p.codigo}</span>
        <span className="line-clamp-2 text-sm leading-snug font-medium">{p.nombre}</span>
        <span className="truncate text-xs text-gris">{resumenMetal(p, x.ley) || x.categoria || " "}</span>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-base font-semibold whitespace-nowrap tabular-nums">
            {x.precio.oferta != null && x.precio.lista != null && <span className="mr-1 text-xs font-normal text-gris line-through">{pesosEnteros(x.precio.lista)}</span>}
            {pesosEnteros(x.precio.vigente)}
          </span>
          {p.tipo !== "unica" && (
            <span className={`text-xs whitespace-nowrap ${p.stockMinimo > 0 && p.cantidad <= p.stockMinimo ? "font-semibold text-error" : "text-gris"}`}>{p.cantidad} u.</span>
          )}
        </div>
        {x.precio.porGramo && <span className="text-[0.65rem] text-champagne">Precio por gramo · se actualiza solo</span>}
      </div>
    </Link>
  );
}

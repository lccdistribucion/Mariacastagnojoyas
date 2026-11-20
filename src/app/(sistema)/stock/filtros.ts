import type { FiltroStock } from "@/lib/stock/consultas";

type Busqueda = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function leerFiltrosStock(sp: Busqueda): FiltroStock {
  return {
    q: uno(sp.q)?.slice(0, 80),
    categoriaId: Number(uno(sp.categoria)) || undefined,
    tipo: uno(sp.tipo),
    estado: uno(sp.estado) ?? "stock",
    ubicacionId: Number(uno(sp.ubicacion)) || undefined,
    leyId: Number(uno(sp.ley)) || undefined,
    artesano: uno(sp.artesano),
    stockBajo: uno(sp.bajo) === "1",
    pagina: Number(uno(sp.pagina)) || 1,
  };
}

export function queryStock(f: FiltroStock, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  const v: Record<string, unknown> = { q: f.q, categoria: f.categoriaId, tipo: f.tipo, estado: f.estado === "stock" ? undefined : f.estado, ubicacion: f.ubicacionId, ley: f.leyId, artesano: f.artesano, bajo: f.stockBajo ? 1 : undefined, pagina: f.pagina && f.pagina > 1 ? f.pagina : undefined, ...extra };
  for (const [k, x] of Object.entries(v)) if (x != null && x !== "") p.set(k, String(x));
  return p.toString();
}

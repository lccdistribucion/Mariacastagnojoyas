import type { FiltroAuditoria } from "@/lib/auditoria-consulta";

type Busqueda = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function leerFiltros(sp: Busqueda): FiltroAuditoria {
  const fechaOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    desde: fechaOk(uno(sp.desde)),
    hasta: fechaOk(uno(sp.hasta)),
    usuarioId: Number(uno(sp.usuarioId)) || undefined,
    accion: uno(sp.accion),
    entidad: uno(sp.entidad),
    texto: uno(sp.texto)?.slice(0, 100),
    pagina: Number(uno(sp.pagina)) || 1,
  };
}

export function aQuery(f: FiltroAuditoria, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v != null && v !== "" && !(k === "pagina" && v === 1)) p.set(k, String(v));
  return p.toString();
}

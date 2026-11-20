import { NextResponse } from "next/server";
import { leerFiltros } from "@/app/(sistema)/auditoria/filtros";
import { conSesion } from "@/lib/api";
import { consultarAuditoria } from "@/lib/auditoria-consulta";

/** GET /api/v1/auditoria?desde=aaaa-mm-dd&hasta=&usuarioId=&accion=&entidad=&texto=&pagina= */
export const GET = conSesion("ver_auditoria", async (_u, req) => {
  const f = leerFiltros(Object.fromEntries(new URL(req.url).searchParams));
  const r = await consultarAuditoria(f);
  return NextResponse.json({
    ...r,
    filas: r.filas.map((x) => ({ ...x, antes: x.antes && JSON.parse(x.antes), despues: x.despues && JSON.parse(x.despues) })),
  });
});

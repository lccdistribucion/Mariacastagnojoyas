import { NextResponse } from "next/server";
import { leerFiltrosStock } from "@/app/(sistema)/stock/filtros";
import { conSesion } from "@/lib/api";
import { listarStock } from "@/lib/stock/consultas";

/** GET /api/v1/productos?q=&categoria=&estado=&ubicacion=&ley=&tipo=&bajo=1&pagina= — con precio de hoy. Sin costos salvo permiso. */
export const GET = conSesion(null, async (u, req) => {
  const r = await listarStock(leerFiltrosStock(Object.fromEntries(new URL(req.url).searchParams)));
  const verCostos = u.permisos.has("ver_costos");
  return NextResponse.json({
    total: r.total,
    pagina: r.pagina,
    paginas: r.paginas,
    productos: r.filas.map((x) => {
      const { costoMetal, costoManoObra, costoPiedras, costoOtros, monedaCosto, notasInternas, ...p } = x.p;
      return { ...p, categoria: x.categoria, ubicacion: x.ubicacion, ley: x.ley, foto: x.foto, precioHoy: x.precio, ...(verCostos ? { costo: { costoMetal, costoManoObra, costoPiedras, costoOtros, monedaCosto, enPesos: x.costo.enPesos }, notasInternas } : {}) };
    }),
  });
});

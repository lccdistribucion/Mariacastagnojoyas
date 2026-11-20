import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { listarVentas } from "@/lib/ventas/consultas";

/**
 * GET /api/v1/ventas?desde=aaaa-mm-dd&hasta=&clienteId=&medioId=&leyId=&texto=&anuladas=1
 * Respeta los permisos: sin «ver ventas de todos» solo las propias; sin «ver sin facturar», no aparecen las internas.
 */
export const GET = conSesion(null, async (u, req) => {
  const p = new URL(req.url).searchParams;
  const n = (k: string) => Number(p.get(k)) || undefined;
  const filas = await listarVentas(
    { desde: p.get("desde") ?? undefined, hasta: p.get("hasta") ?? undefined, clienteId: n("clienteId"), medioId: n("medioId"), leyId: n("leyId"), texto: p.get("texto") ?? undefined, incluirAnuladas: p.get("anuladas") === "1" },
    { usuarioId: u.id, verTodas: u.permisos.has("ver_ventas_de_todos"), verSinFacturar: u.permisos.has("ver_sin_facturar") },
  );
  return NextResponse.json({ filas: filas.map((f) => ({ ...f.v, cliente: f.cliente, vendedor: f.vendedor })) });
});

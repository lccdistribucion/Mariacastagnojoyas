import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { buscarPorCodigo } from "@/lib/stock/productos";

/** GET /api/v1/productos/buscar?codigo=ANI-0001 — busca por código interno o código de barras (para lectores). */
export const GET = conSesion(null, async (_u, req) => {
  const codigo = new URL(req.url).searchParams.get("codigo") ?? "";
  const p = await buscarPorCodigo(codigo);
  return p ? NextResponse.json({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, tipo: p.tipo, cantidad: p.cantidad }) : NextResponse.json({ error: "No existe" }, { status: 404 });
});

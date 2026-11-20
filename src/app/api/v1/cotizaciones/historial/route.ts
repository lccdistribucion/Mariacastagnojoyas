import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { haceDias, serieDiaria } from "@/lib/cotizaciones/historial";
import { CODIGOS, type Codigo } from "@/lib/cotizaciones/tipos";

/** GET /api/v1/cotizaciones/historial?codigo=USD_BLUE&dias=30 — último valor de venta de cada día. */
export const GET = conSesion(null, async (_u, req) => {
  const p = new URL(req.url).searchParams;
  const codigo = p.get("codigo") as Codigo;
  if (!(codigo in CODIGOS)) return NextResponse.json({ error: "Código desconocido", codigos: Object.keys(CODIGOS) }, { status: 400 });
  const dias = Math.min(3650, Math.max(1, Number(p.get("dias")) || 30));
  return NextResponse.json({ codigo, dias, serie: await serieDiaria(codigo, haceDias(dias)) });
});

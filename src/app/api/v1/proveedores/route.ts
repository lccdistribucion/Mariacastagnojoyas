import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { listarProveedores } from "@/lib/proveedores/proveedores";

/** GET /api/v1/proveedores?q=&rubro=&saldo=1 — requiere «ver_proveedores». Saldos por moneda (positivo: le debemos). */
export const GET = conSesion("ver_proveedores", async (_u, req) => {
  const p = new URL(req.url).searchParams;
  return NextResponse.json({ proveedores: await listarProveedores({ q: p.get("q") ?? undefined, rubro: p.get("rubro") ?? undefined, conSaldo: p.get("saldo") === "1" }) });
});

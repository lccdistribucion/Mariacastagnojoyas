import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { listarClientes } from "@/lib/clientes/clientes";

/** GET /api/v1/clientes?q=&saldo=1&pagina= — búsqueda de clientes con su saldo de cuenta corriente. */
export const GET = conSesion(null, async (_u, req) => {
  const p = new URL(req.url).searchParams;
  const r = await listarClientes({ q: p.get("q") ?? undefined, conSaldo: p.get("saldo") === "1", pagina: Number(p.get("pagina")) || 1 });
  return NextResponse.json({ ...r, filas: r.filas.map((x) => ({ ...x.c, saldo: x.saldo })) });
});

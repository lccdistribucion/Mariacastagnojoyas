import { NextResponse } from "next/server";
import { z } from "zod";
import { cerrarSesion, intentarIngreso } from "@/lib/auth/ingreso";
import { borrarCookie, dispositivoActual, guardarCookie, ipActual, tokenActual } from "@/lib/auth/sesion";

const cuerpo = z.object({ usuario: z.string().max(60), clave: z.string().max(200) });

/** POST /api/v1/sesion {usuario, clave} — ingreso (deja la cookie de sesión). */
export async function POST(req: Request) {
  const datos = cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Faltan usuario y clave." }, { status: 400 });
  const r = await intentarIngreso(datos.data.usuario, datos.data.clave, { ip: await ipActual(), dispositivo: await dispositivoActual() });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  await guardarCookie(r.token, r.maxAgeSeg);
  return NextResponse.json({ ok: true, debeCambiarClave: r.debeCambiarClave });
}

/** DELETE /api/v1/sesion — cierra la sesión actual. */
export async function DELETE() {
  await cerrarSesion(await tokenActual(), "salida", await ipActual());
  await borrarCookie();
  return NextResponse.json({ ok: true });
}

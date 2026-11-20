/** Cierra la sesión (botón «Salir» o cierre automático por inactividad) y vuelve al ingreso. */
import { type NextRequest } from "next/server";
import { cerrarSesion } from "@/lib/auth/ingreso";
import { borrarCookie, ipActual, tokenActual } from "@/lib/auth/sesion";

export async function POST(req: NextRequest) {
  const motivo = req.nextUrl.searchParams.get("motivo") === "inactividad" ? "inactividad" : "salida";
  await cerrarSesion(await tokenActual(), motivo, await ipActual());
  await borrarCookie();
  // Redirección relativa: así funciona igual se entre por localhost, por la IP del local o por un nombre.
  return new Response(null, { status: 303, headers: { Location: `/ingresar?motivo=${motivo}` } });
}

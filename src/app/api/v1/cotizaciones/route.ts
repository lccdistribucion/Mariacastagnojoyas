import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { obtenerVigentes, preciosPorLey } from "@/lib/cotizaciones/vigentes";

/** GET /api/v1/cotizaciones — cotizaciones vigentes (con fuente, fecha y estado) y precio del gramo por ley. */
export const GET = conSesion(null, async () => {
  const vigentes = await obtenerVigentes();
  const leyes = await preciosPorLey(vigentes);
  return NextResponse.json({ vigentes, referencia: leyes.referencia, leyes: leyes.leyes });
});

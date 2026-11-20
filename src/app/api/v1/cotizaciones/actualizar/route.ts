import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { actualizarCotizaciones } from "@/lib/cotizaciones/actualizar";

/** POST /api/v1/cotizaciones/actualizar — «Actualizar ahora». Requiere «modificar_cotizaciones». */
export const POST = conSesion("modificar_cotizaciones", async (u) => NextResponse.json(await actualizarCotizaciones("manual", u.id)));

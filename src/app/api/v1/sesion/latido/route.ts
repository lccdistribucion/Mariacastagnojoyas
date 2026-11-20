import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";

/** POST /api/v1/sesion/latido — la pantalla avisa que la persona sigue usándola (evita el cierre por inactividad). */
export const POST = conSesion(null, async () => NextResponse.json({ ok: true }));

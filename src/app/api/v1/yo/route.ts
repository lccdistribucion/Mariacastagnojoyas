import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";

/** GET /api/v1/yo — datos del usuario conectado y sus permisos. */
export const GET = conSesion(null, async (u) =>
  NextResponse.json({
    id: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    permisos: [...u.permisos],
    inactividadMinutos: u.inactividadMinutos,
  }),
);

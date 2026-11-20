import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { listarUsuarios } from "@/lib/usuarios";

/** GET /api/v1/usuarios — lista de usuarios (sin claves). Requiere «gestionar_usuarios». */
export const GET = conSesion("gestionar_usuarios", async () => NextResponse.json({ usuarios: await listarUsuarios() }));

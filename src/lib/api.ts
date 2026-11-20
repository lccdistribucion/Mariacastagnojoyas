/**
 * Ayuda para la API REST (/api/v1/...). Usa la misma sesión que las pantallas (cookie) y responde JSON.
 * 401 = no hay sesión o venció; 403 = no tiene el permiso.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { UsuarioSesion } from "./auth/ingreso";
import { usuarioActual } from "./auth/sesion";
import type { Permiso } from "./permisos";

export function conSesion<C>(permiso: Permiso | null, fn: (u: UsuarioSesion, req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const u = await usuarioActual();
    if (!u) return NextResponse.json({ error: "No hay sesión o venció." }, { status: 401 });
    if (permiso && !u.permisos.has(permiso)) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    return fn(u, req, ctx);
  };
}

/** Puente entre la cookie del navegador y la sesión en la base. Solo del lado del servidor. */
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Actor } from "../auditoria";
import type { Permiso } from "../permisos";
import { validarSesion, type UsuarioSesion } from "./ingreso";

export const COOKIE = "mc_sesion";

/** Dirección del equipo que hace el pedido (detrás de un proxy, la primera de x-forwarded-for). */
export async function ipActual() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function dispositivoActual() {
  return (await headers()).get("user-agent") ?? "";
}

/** ¿Se entró por HTTPS? (si es así, la cookie se marca como segura). */
async function esHttps() {
  return ((await headers()).get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
}

export async function guardarCookie(token: string, maxAgeSeg: number) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: await esHttps(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeg,
  });
}

export async function tokenActual() {
  return (await cookies()).get(COOKIE)?.value;
}

export async function borrarCookie() {
  (await cookies()).delete(COOKIE);
}

/** Usuario de la sesión actual (una sola consulta por pedido gracias a `cache`). */
export const usuarioActual = cache(async (): Promise<UsuarioSesion | null> => validarSesion(await tokenActual()));

/** Exige sesión; si no hay, manda al ingreso. Si debe cambiar la clave, lo lleva a esa pantalla. */
export async function requiereUsuario(opts: { permitirCambioPendiente?: boolean } = {}) {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  if (u.debeCambiarClave && !opts.permitirCambioPendiente) redirect("/cambiar-clave");
  return u;
}

/** Exige un permiso; si no lo tiene, muestra la pantalla «sin permiso». */
export async function requierePermiso(permiso: Permiso) {
  const u = await requiereUsuario();
  if (!u.permisos.has(permiso)) redirect("/sin-permiso");
  return u;
}

export async function actorDe(u: UsuarioSesion): Promise<Actor> {
  return { id: u.id, nombre: u.nombre, ip: await ipActual() };
}

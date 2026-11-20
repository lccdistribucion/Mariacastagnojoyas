"use server";
import { redirect } from "next/navigation";
import { intentarIngreso } from "@/lib/auth/ingreso";
import { dispositivoActual, guardarCookie, ipActual } from "@/lib/auth/sesion";

export type EstadoIngreso = { error?: string; usuario?: string } | undefined;

export async function ingresar(_prev: EstadoIngreso, form: FormData): Promise<EstadoIngreso> {
  const usuario = String(form.get("usuario") ?? "").slice(0, 60);
  const clave = String(form.get("clave") ?? "").slice(0, 200);
  const r = await intentarIngreso(usuario, clave, { ip: await ipActual(), dispositivo: await dispositivoActual() });
  if (!r.ok) return { error: r.error, usuario };
  await guardarCookie(r.token, r.maxAgeSeg);
  redirect(r.debeCambiarClave ? "/cambiar-clave" : "/");
}

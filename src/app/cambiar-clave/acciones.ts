"use server";
import { redirect } from "next/navigation";
import { actorDe, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { cambiarClavePropia } from "@/lib/usuarios";

export type EstadoClave = { error?: string } | undefined;

export async function cambiarClave(_prev: EstadoClave, form: FormData): Promise<EstadoClave> {
  const u = await requiereUsuario({ permitirCambioPendiente: true });
  const actual = String(form.get("actual") ?? "");
  const nueva = String(form.get("nueva") ?? "");
  const repetir = String(form.get("repetir") ?? "");
  if (nueva !== repetir) return { error: "Las dos claves nuevas no coinciden." };
  try {
    await cambiarClavePropia(u.id, actual, nueva, await actorDe(u), u.sesionId);
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  redirect("/?aviso=clave");
}

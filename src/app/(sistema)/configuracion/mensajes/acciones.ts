"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion, guardarConfig } from "@/lib/config";

export async function guardarMensajes(_p: { ok?: string; error?: string } | undefined, f: FormData) {
  const u = await requierePermiso("configurar_sistema");
  try {
    await guardarConfig({ "mensajes.cumpleanos": String(f.get("cumpleanos") ?? "").trim(), "mensajes.aniversario": String(f.get("aniversario") ?? "").trim(), "mensajes.saldo": String(f.get("saldo") ?? "").trim(), "mensajes.reparacion_lista": String(f.get("reparacion") ?? "").trim(), "mensajes.pedido_listo": String(f.get("pedido") ?? "").trim(), "mensajes.comprobante": String(f.get("comprobante") ?? "").trim() }, await actorDe(u));
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: "Mensajes guardados." };
}

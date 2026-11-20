"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { cambiarEstadoUsuario, crearUsuario, desbloquearUsuario, editarUsuario, reiniciarClave } from "@/lib/usuarios";

export type EstadoForm = { error?: string; ok?: string; claveTemporal?: string; id?: number } | undefined;

const pct = (v: FormDataEntryValue | null) => {
  const n = leerNumero(String(v ?? ""));
  return n == null ? null : Math.round(n * 100);
};

async function conErrores(fn: () => Promise<EstadoForm>): Promise<EstadoForm> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function guardarUsuario(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const u = await requierePermiso("gestionar_usuarios");
  const actor = await actorDe(u);
  const id = Number(form.get("id")) || null;
  const datos = {
    usuario: String(form.get("usuario") ?? ""),
    nombre: String(form.get("nombre") ?? ""),
    rol: (form.get("rol") === "admin" ? "admin" : "usuario") as "admin" | "usuario",
    descuentoMaxPct: pct(form.get("descuentoMax")),
    comisionPct: pct(form.get("comision")) ?? 0,
    permisos: form.getAll("permisos").map(String),
  };
  return conErrores(async () => {
    if (id) {
      await editarUsuario(id, datos, actor);
      revalidatePath("/usuarios");
      return { ok: "Cambios guardados.", id };
    }
    const r = await crearUsuario(datos, actor);
    revalidatePath("/usuarios");
    return { ok: "Usuario creado.", id: r.id, claveTemporal: r.claveTemporal ?? undefined };
  });
}

export async function accionUsuario(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const u = await requierePermiso("gestionar_usuarios");
  const actor = await actorDe(u);
  const id = Number(form.get("id"));
  const que = String(form.get("accion"));
  return conErrores(async () => {
    let r: EstadoForm;
    if (que === "desactivar") {
      await cambiarEstadoUsuario(id, false, actor);
      r = { ok: "Usuario desactivado: ya no puede ingresar y se cerraron sus sesiones." };
    } else if (que === "reactivar") {
      await cambiarEstadoUsuario(id, true, actor);
      r = { ok: "Usuario reactivado." };
    } else if (que === "reiniciar") {
      r = { ok: "Clave reiniciada.", claveTemporal: await reiniciarClave(id, actor) };
    } else if (que === "poner_clave") {
      const clave = String(form.get("clave") ?? "");
      if (!clave) throw new ErrorValidacion("Escribí la clave nueva.");
      const obligar = form.get("obligarCambio") === "on";
      await reiniciarClave(id, actor, clave, obligar);
      r = { ok: obligar ? "Clave cambiada. Al ingresar va a tener que elegir una propia." : "Clave cambiada." };
    } else if (que === "desbloquear") {
      await desbloquearUsuario(id, actor);
      r = { ok: "Ingreso desbloqueado." };
    } else r = { error: "Acción desconocida." };
    revalidatePath("/usuarios");
    revalidatePath(`/usuarios/${id}`);
    return r;
  });
}

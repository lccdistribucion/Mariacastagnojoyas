"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion, guardarConfig } from "@/lib/config";
import { leerNumero } from "@/lib/formato";

export type EstadoConfig = { error?: string; ok?: string } | undefined;

export async function guardarSeguridad(_prev: EstadoConfig, form: FormData): Promise<EstadoConfig> {
  const u = await requierePermiso("configurar_sistema");
  const entero = (k: string) => {
    const n = leerNumero(String(form.get(k) ?? ""));
    return n == null ? NaN : Math.round(n);
  };
  const desc = leerNumero(String(form.get("descuento") ?? ""));
  try {
    await guardarConfig(
      {
        "negocio.nombre": String(form.get("nombre") ?? "").trim(),
        "seguridad.intentos_max": entero("intentos"),
        "seguridad.bloqueo_minutos": entero("bloqueo"),
        "seguridad.inactividad_minutos": entero("inactividad"),
        "seguridad.sesion_horas": entero("horas"),
        "ventas.descuento_max_pct": desc == null ? NaN : Math.round(desc * 100),
      },
      await actorDe(u),
    );
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: "Configuración guardada." };
}

"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion, guardarConfig } from "@/lib/config";
import { guardarLey } from "@/lib/cotizaciones/gestion";
import { importarHistorial } from "@/lib/cotizaciones/historial";
import { leerNumero } from "@/lib/formato";

export type Estado = { ok?: string; error?: string } | undefined;

async function seguro(fn: () => Promise<Estado>): Promise<Estado> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

const entero = (v: FormDataEntryValue | null) => {
  const n = leerNumero(String(v ?? ""));
  return n == null ? NaN : Math.round(n);
};
const pct = (v: FormDataEntryValue | null) => {
  const n = leerNumero(String(v ?? ""));
  return n == null ? 0 : Math.round(n * 100);
};

export async function guardarParametros(_p: Estado, form: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return seguro(async () => {
    const umbral = leerNumero(String(form.get("umbral") ?? ""));
    await guardarConfig(
      {
        "cotizaciones.dolar_referencia": String(form.get("referencia")),
        "cotizaciones.frecuencia_minutos": entero(form.get("frecuencia")),
        "cotizaciones.frecuencia_fuera_horario": entero(form.get("fuera")),
        "cotizaciones.horario_desde": String(form.get("desde")),
        "cotizaciones.horario_hasta": String(form.get("hasta")),
        "cotizaciones.dias": form.getAll("dias").map(Number),
        "cotizaciones.alerta_variacion_pct": umbral == null ? NaN : Math.round(umbral * 100),
        "cotizaciones.ley_oro_bajo": entero(form.get("oroBajo")),
        "backup.hora": String(form.get("backupHora")),
        "backup.conservar": entero(form.get("backupConservar")),
        "backup.carpeta_extra": String(form.get("backupCarpeta") ?? "").trim(),
      },
      await actorDe(u),
    );
    revalidatePath("/", "layout");
    return { ok: "Configuración guardada." };
  });
}

export async function guardarFuentes(_p: Estado, form: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return seguro(async () => {
    const orden = JSON.parse(String(form.get("orden") ?? "[]"));
    await guardarConfig({ "cotizaciones.conectores": orden }, await actorDe(u));
    revalidatePath("/", "layout");
    return { ok: "Fuentes guardadas." };
  });
}

export async function guardarLeyAccion(_p: Estado, form: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return seguro(async () => {
    const id = Number(form.get("id")) || null;
    const quilates = leerNumero(String(form.get("quilates") ?? ""));
    const milesimos = leerNumero(String(form.get("milesimos") ?? ""));
    const manual = leerNumero(String(form.get("precioManual") ?? ""));
    await guardarLey(
      id,
      {
        nombre: String(form.get("nombre") ?? ""),
        metal: String(form.get("metal")) as "oro" | "plata" | "otro",
        quilates: quilates == null ? null : Math.round(quilates),
        milesimos: milesimos == null ? null : Math.round(milesimos),
        ajusteVentaPct: pct(form.get("ajusteVenta")),
        ajusteCompraPct: pct(form.get("ajusteCompra")),
        precioManualGramo: manual == null ? null : Math.round(manual * 100),
        activo: form.get("activo") === "on",
        orden: entero(form.get("orden")) || 0,
      },
      await actorDe(u),
    );
    revalidatePath("/", "layout");
    return { ok: id ? "Ley guardada." : "Ley agregada." };
  });
}

export async function traerHistorial(_p: Estado, form: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  const dias = Math.min(3650, Math.max(7, Number(form.get("dias")) || 365));
  const r = await importarHistorial(dias, await actorDe(u));
  revalidatePath("/", "layout");
  if (!r.total && r.errores.length) return { error: `No se pudo traer el historial (${r.errores.join("; ")}).` };
  return { ok: r.total ? `Se agregaron ${r.total.toLocaleString("es-AR")} valores diarios.${r.errores.length ? ` Sin respuesta: ${r.errores.length} series.` : ""}` : "El historial ya estaba completo para ese período." };
}

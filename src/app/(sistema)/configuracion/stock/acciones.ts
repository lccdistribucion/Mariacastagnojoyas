"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion, guardarConfig } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { guardarCategoria, guardarLista, guardarUbicacion } from "@/lib/stock/catalogos";
import { quitarDemo } from "@/lib/stock/demo";

export type Estado = { ok?: string; error?: string } | undefined;
async function seguro(fn: () => Promise<Estado>): Promise<Estado> {
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    return r;
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function accionCatalogo(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  const actor = await actorDe(u);
  const id = Number(f.get("id")) || null;
  const nombre = String(f.get("nombre") ?? "");
  const activo = f.get("activo") === "on";
  const orden = Number(f.get("orden")) || 0;
  return seguro(async () => {
    const que = f.get("que");
    if (que === "categoria") await guardarCategoria(id, { nombre, prefijo: String(f.get("prefijo") ?? ""), activo, orden }, actor);
    else if (que === "ubicacion") await guardarUbicacion(id, { nombre, activo, orden }, actor);
    else await guardarLista(id, { nombre, ajustePct: Math.round((leerNumero(String(f.get("ajuste") ?? "")) ?? 0) * 100), activo, orden }, actor);
    return { ok: "Guardado." };
  });
}

export async function accionOpciones(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return seguro(async () => {
    await guardarConfig(
      {
        "stock.permitir_negativo": f.get("negativo") === "on",
        "stock.meses_sin_movimiento": Number(f.get("meses")),
        "etiquetas.formato": String(f.get("formato")),
        "etiquetas.con_precio": f.get("conPrecio") === "on",
      },
      await actorDe(u),
    );
    return { ok: "Opciones guardadas." };
  });
}

export async function accionQuitarDemo(): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return seguro(async () => {
    const n = await quitarDemo(await actorDe(u));
    return { ok: n ? `Listo: se quitaron los datos de ejemplo (${n} registros).` : "No había datos de ejemplo." };
  });
}

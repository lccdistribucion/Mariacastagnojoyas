"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorDe, requierePermiso, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { abrirInventario, cerrarInventario, registrarLectura } from "@/lib/stock/inventario";

export async function accionAbrir(_p: { error?: string } | undefined, f: FormData) {
  const u = await requiereUsuario();
  let id = 0;
  try {
    id = await abrirInventario(String(f.get("nombre") ?? ""), Number(f.get("ubicacionId")) || null, await actorDe(u));
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  redirect(`/stock/inventario/${id}`);
}

export async function accionLeer(inventarioId: number, codigo: string) {
  const u = await requiereUsuario();
  try {
    return { ok: true as const, ...(await registrarLectura(inventarioId, codigo, await actorDe(u))) };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function accionCerrar(f: FormData) {
  const u = await requierePermiso("ajustar_stock");
  const id = Number(f.get("id"));
  await cerrarInventario(id, await actorDe(u));
  revalidatePath(`/stock/inventario/${id}`);
}

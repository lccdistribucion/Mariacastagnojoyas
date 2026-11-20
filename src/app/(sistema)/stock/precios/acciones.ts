"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { aplicarMasivo, vistaPrevia, type FiltroMasivo, type OpcionesMasivo } from "@/lib/stock/masivo";

export async function previaMasivo(f: FiltroMasivo, o: OpcionesMasivo) {
  await requierePermiso("modificar_precios");
  try {
    return { filas: await vistaPrevia(f, o) };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function aplicar(f: FiltroMasivo, o: OpcionesMasivo, ids: number[]) {
  const u = await requierePermiso("modificar_precios");
  try {
    const n = await aplicarMasivo(f, o, ids, await actorDe(u));
    revalidatePath("/stock", "layout");
    return { ok: `Listo: se actualizaron ${n} precios. Quedó todo en el historial de cada pieza y en Auditoría.` };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

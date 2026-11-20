"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { actualizarCotizaciones } from "@/lib/cotizaciones/actualizar";
import { cargarManual, quitarFija } from "@/lib/cotizaciones/gestion";
import { CODIGOS, type Codigo } from "@/lib/cotizaciones/tipos";
import { leerNumero } from "@/lib/formato";

export type EstadoAccion = { ok?: string; error?: string } | undefined;

/** Botón «Actualizar ahora» (barra superior y pantalla de Cotizaciones). */
export async function actualizarAhora(): Promise<EstadoAccion> {
  const u = await requierePermiso("modificar_cotizaciones");
  const r = await actualizarCotizaciones("manual", u.id);
  revalidatePath("/", "layout");
  if (r.fallidas.length === r.actualizadas.length + r.fallidas.length) return { error: "Ninguna fuente respondió. Se siguen usando los últimos valores guardados." };
  const partes = [`${r.actualizadas.length} cotizaciones actualizadas`];
  if (r.conRespaldo.length) partes.push(`${r.conRespaldo.length} con la fuente de respaldo`);
  if (r.fallidas.length) partes.push(`${r.fallidas.length} sin respuesta (queda el último valor)`);
  return { ok: `${partes.join(", ")}.` };
}

export async function accionCargaManual(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const u = await requierePermiso("modificar_cotizaciones");
  const codigo = String(form.get("codigo")) as Codigo;
  if (!(codigo in CODIGOS)) return { error: "Elegí una cotización." };
  const compra = leerNumero(String(form.get("compra") ?? ""));
  const venta = leerNumero(String(form.get("venta") ?? "")) ?? compra;
  if (compra == null || venta == null) return { error: "Escribí los valores de compra y venta." };
  try {
    await cargarManual(codigo, compra, venta, form.get("fijar") === "on", String(form.get("nota") ?? "").slice(0, 120), await actorDe(u));
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: form.get("fijar") === "on" ? "Cotización propia fijada: la automática no la reemplaza hasta que la quites." : "Cotización cargada. La próxima actualización automática la va a reemplazar." };
}

export async function accionQuitarFija(form: FormData) {
  const u = await requierePermiso("modificar_cotizaciones");
  const codigo = String(form.get("codigo")) as Codigo;
  if (codigo in CODIGOS) await quitarFija(codigo, await actorDe(u));
  revalidatePath("/", "layout");
}

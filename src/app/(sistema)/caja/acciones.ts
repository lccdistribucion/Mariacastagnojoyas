"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { abrirCaja, cerrarCaja } from "@/lib/tesoreria/arqueos";
import { formatoMoneda, obtenerCaja } from "@/lib/tesoreria/cajas";

export type Estado = { ok?: string; error?: string; diferencia?: number } | undefined;

export async function accionArqueo(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const cajaId = Number(f.get("cajaId"));
  const momento = String(f.get("momento"));
  try {
    const n = leerNumero(String(f.get("contado") ?? ""));
    if (n == null) throw new ErrorValidacion("Escribí cuánto contaste (si no hay nada, 0).");
    const contado = Math.round(n * 100);
    const notas = String(f.get("notas") ?? "");
    const r = momento === "cierre" ? await cerrarCaja(cajaId, contado, notas, await actorDe(u)) : await abrirCaja(cajaId, contado, notas, await actorDe(u));
    const caja = await obtenerCaja(cajaId);
    revalidatePath("/caja");
    revalidatePath("/tesoreria", "layout");
    return { ok: r.diferencia === 0 ? "Coincide con lo esperado." : `${r.diferencia > 0 ? "Sobran" : "Faltan"} ${formatoMoneda(Math.abs(r.diferencia), caja!.moneda)}: quedó registrado y se avisó al administrador.`, diferencia: r.diferencia };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

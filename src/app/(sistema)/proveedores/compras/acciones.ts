"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { anularCompra, registrarCompra, type DatosCompra } from "@/lib/proveedores/compras";
import { buscarPorCodigo } from "@/lib/stock/productos";

export async function guardarCompra(_p: { error?: string } | undefined, f: FormData): Promise<{ error?: string } | undefined> {
  const u = await requierePermiso("ver_proveedores");
  let id = 0;
  try {
    const d = JSON.parse(String(f.get("datos") ?? "{}")) as DatosCompra & { fecha: string; vencimiento: string | null; chequePropio: { numero: string; bancoCajaId: number; fechaPago: string } | null };
    if (d.chequePropio && !d.chequePropio.fechaPago) throw new ErrorValidacion("Indicá la fecha de pago del cheque.");
    const chequePropio = d.chequePropio ? { ...d.chequePropio, fechaPago: new Date(`${d.chequePropio.fechaPago}T12:00:00-03:00`) } : null;
    id = await registrarCompra({ ...d, chequePropio, fecha: new Date(`${d.fecha}T12:00:00-03:00`), vencimiento: d.vencimiento ? new Date(`${d.vencimiento}T20:00:00-03:00`) : null }, await actorDe(u));
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    if (e instanceof SyntaxError) return { error: "Datos incompletos." };
    throw e;
  }
  revalidatePath("/proveedores", "layout");
  revalidatePath("/stock");
  redirect(`/proveedores/compras/${id}?aviso=cargada`);
}

/** Busca un artículo por código para sumarle unidades. */
export async function buscarArticulo(codigo: string) {
  await requierePermiso("ver_proveedores");
  const p = await buscarPorCodigo(codigo);
  if (!p) return { error: "No existe ese código." };
  if (p.tipo === "unica") return { error: `${p.codigo} es una pieza única: cargala como pieza nueva.` };
  return { id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad };
}

export async function accionAnularCompra(_p: { error?: string } | undefined, f: FormData) {
  const u = await requierePermiso("anular_comprobantes");
  const id = Number(f.get("compraId"));
  try {
    await anularCompra(id, String(f.get("motivo") ?? ""), await actorDe(u));
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  revalidatePath("/proveedores", "layout");
  revalidatePath("/stock");
  return undefined;
}

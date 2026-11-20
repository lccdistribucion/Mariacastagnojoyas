"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { cambiarEstadoPedido, crearPedido, metalTaller, senaPedido, type EstadoPedido } from "@/lib/taller/pedidos";
import { actualizarPresupuestoReparacion, cambiarEstadoReparacion, crearReparacion, TRABAJOS, type EstadoReparacion } from "@/lib/taller/reparaciones";
import type { PagoIn } from "@/lib/ventas/cobros";

export type Estado = { ok?: string; error?: string; id?: number } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const pesos = (f: FormData, k: string) => {
  const n = leerNumero(txt(f, k));
  return n == null ? null : Math.round(n * 100);
};
const mg = (f: FormData, k: string) => {
  const n = leerNumero(txt(f, k));
  return n == null ? null : Math.round(n * 1000);
};
const dia = (f: FormData, k: string) => (txt(f, k) ? new Date(`${txt(f, k)}T12:00:00-03:00`) : null);
const pagos = (f: FormData) => (JSON.parse(txt(f, "pagos") || "[]") as PagoIn[]).filter((p) => p.aplicado > 0);

async function intentar(fn: () => Promise<Estado>): Promise<Estado> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    if (e instanceof SyntaxError) return { error: "Revisá los datos del pago." };
    throw e;
  }
}

export async function accionNuevaReparacion(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  return intentar(async () => {
    const r = await crearReparacion(
      {
        clienteId: Number(txt(f, "clienteId")),
        descripcion: txt(f, "descripcion"),
        trabajos: f.getAll("trabajos").map(String) as (keyof typeof TRABAJOS)[],
        detalle: txt(f, "detalle"),
        pesoIngresoMg: mg(f, "peso"),
        presupuesto: pesos(f, "presupuesto"),
        fechaPrometida: dia(f, "fechaPrometida"),
        sena: txt(f, "conSena") ? pagos(f) : [],
      },
      await actorDe(u),
    );
    return { id: r.id, ok: `Reparación N.º ${r.numero} registrada.` };
  });
}

export async function accionEstadoReparacion(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(txt(f, "id"));
  const r = await intentar(async () => {
    await cambiarEstadoReparacion(id, txt(f, "estado") as EstadoReparacion, { nota: txt(f, "nota"), proveedorId: Number(txt(f, "proveedorId")) || null, costoTaller: pesos(f, "costoTaller") }, await actorDe(u));
    return { ok: "Estado actualizado." };
  });
  revalidatePath(`/taller/${id}`);
  return r;
}

export async function accionPresupuestoReparacion(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(txt(f, "id"));
  const r = await intentar(async () => {
    const importe = pesos(f, "presupuesto");
    if (importe == null) throw new ErrorValidacion("Indicá el importe.");
    await actualizarPresupuestoReparacion(id, importe, await actorDe(u));
    return { ok: "Importe actualizado." };
  });
  revalidatePath(`/taller/${id}`);
  return r;
}

/** Al tocar «Avisar por WhatsApp» la reparación queda como avisada. */
export async function marcarAvisada(id: number) {
  const u = await requiereUsuario();
  try {
    await cambiarEstadoReparacion(id, "avisada", { nota: "Aviso por WhatsApp" }, await actorDe(u));
  } catch (e) {
    if (!(e instanceof ErrorValidacion)) throw e;
  }
  revalidatePath(`/taller/${id}`);
}

export async function accionNuevoPedido(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  return intentar(async () => {
    const r = await crearPedido(
      {
        clienteId: Number(txt(f, "clienteId")),
        descripcion: txt(f, "descripcion"),
        leyId: Number(txt(f, "leyId")) || null,
        piedras: txt(f, "piedras"),
        talle: txt(f, "talle"),
        modoPrecio: txt(f, "modoPrecio") === "cotizacion" ? "cotizacion" : "congelado",
        presupuesto: pesos(f, "presupuesto") ?? 0,
        gramosEstimadosMg: mg(f, "gramos"),
        hechura: pesos(f, "hechura") ?? 0,
        entregaEstimada: dia(f, "entrega"),
        notas: txt(f, "notas"),
        sena: txt(f, "conSena") ? pagos(f) : [],
      },
      await actorDe(u),
    );
    return { id: r.id, ok: `Pedido N.º ${r.numero} registrado.` };
  });
}

export async function accionEstadoPedido(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(txt(f, "id"));
  const r = await intentar(async () => {
    await cambiarEstadoPedido(id, txt(f, "estado") as EstadoPedido, { nota: txt(f, "nota"), proveedorId: txt(f, "proveedorId") ? Number(txt(f, "proveedorId")) || null : undefined, costoTaller: pesos(f, "costoTaller"), pesoFinalMg: mg(f, "pesoFinal") }, await actorDe(u));
    return { ok: "Estado actualizado." };
  });
  revalidatePath(`/taller/pedidos/${id}`);
  return r;
}

export async function accionSenaPedido(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(txt(f, "id"));
  const r = await intentar(async () => {
    await senaPedido(id, pagos(f), await actorDe(u));
    return { ok: "Pago a cuenta registrado." };
  });
  revalidatePath(`/taller/pedidos/${id}`);
  return r;
}

export async function accionMetalPedido(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(txt(f, "id"));
  const r = await intentar(async () => {
    const g = mg(f, "gramos");
    if (!g || g <= 0) throw new ErrorValidacion("Indicá los gramos.");
    await metalTaller(id, txt(f, "sentido") === "devolucion" ? { devolucionMg: g } : { entregaMg: g }, await actorDe(u));
    return { ok: "Metal registrado." };
  });
  revalidatePath(`/taller/pedidos/${id}`);
  return r;
}

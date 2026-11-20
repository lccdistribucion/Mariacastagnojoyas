"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion, guardarConfig } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { guardarMedio, guardarPlan } from "@/lib/ventas/medios";

export type Estado = { ok?: string; error?: string } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const entero = (f: FormData, k: string) => {
  const n = leerNumero(txt(f, k));
  return n == null ? NaN : Math.round(n);
};
const pct = (f: FormData, k: string) => Math.round((leerNumero(txt(f, k)) ?? 0) * 100);

async function intentar(fn: () => Promise<void>, ok: string): Promise<Estado> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  revalidatePath("/configuracion/ventas");
  return { ok };
}

export async function accionDatosVentas(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await actorDe(await requierePermiso("configurar_sistema"));
  return intentar(
    async () =>
      guardarConfig(
        {
          "negocio.direccion": txt(f, "direccion"),
          "negocio.telefono": txt(f, "telefono"),
          "negocio.cuit": txt(f, "cuit").replace(/\D/g, ""),
          "negocio.web": txt(f, "web"),
          "ventas.garantia_meses": entero(f, "garantia"),
          "ventas.garantia_texto": txt(f, "garantiaTexto"),
          "ventas.vale_meses": entero(f, "valeMeses"),
          "reservas.dias": entero(f, "reservaDias"),
          "presupuestos.validez_dias": entero(f, "presupuestoDias"),
          "reparaciones.dias_abandono": entero(f, "abandono"),
          "reparaciones.condiciones": txt(f, "condiciones"),
        },
        actor,
      ),
    "Datos guardados.",
  );
}

export async function accionMedio(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await actorDe(await requierePermiso("configurar_sistema"));
  const id = Number(txt(f, "id")) || null;
  return intentar(
    async () => guardarMedio(id, { nombre: txt(f, "nombre"), tipo: txt(f, "tipo"), moneda: txt(f, "moneda") || "ARS", ajustePct: pct(f, "ajuste"), activo: txt(f, "activo") === "1", orden: entero(f, "orden") || 0, cajaId: Number(txt(f, "cajaId")) || null }, actor),
    id ? "Medio actualizado." : "Medio agregado.",
  );
}

export async function accionPlan(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await actorDe(await requierePermiso("configurar_sistema"));
  const id = Number(txt(f, "id")) || null;
  return intentar(async () => guardarPlan(id, { medioId: Number(txt(f, "medioId")), cuotas: entero(f, "cuotas"), recargoPct: pct(f, "recargo"), activo: txt(f, "activo") === "1" }, actor), "Plan guardado.");
}

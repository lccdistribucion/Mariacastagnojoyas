"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { anularPago, registrarPago, MEDIOS_PAGO } from "@/lib/proveedores/compras";
import { leerOrigenPago } from "@/lib/tesoreria/formulario";
import { devolverAlConsignante, entregarEnConsignacion, resolverEntregada } from "@/lib/proveedores/consignaciones";
import { cambiarEstadoProveedor, crearProveedor, editarProveedor, movimientoCcProveedorManual, type DatosProveedor, type Rubro } from "@/lib/proveedores/proveedores";

export type Estado = { ok?: string; error?: string } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const plata = (f: FormData, k: string) => {
  const n = leerNumero(txt(f, k));
  return n == null ? 0 : Math.round(n * 100);
};
async function seguro(fn: () => Promise<Estado>, ...rutas: string[]): Promise<Estado> {
  try {
    const r = await fn();
    for (const x of rutas) revalidatePath(x);
    return r;
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function guardarProveedor(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("ver_proveedores");
  const id = Number(f.get("id")) || null;
  const d: DatosProveedor = {
    razonSocial: txt(f, "razonSocial"),
    nombreFantasia: txt(f, "nombreFantasia"),
    cuit: txt(f, "cuit"),
    condicionIva: (txt(f, "condicionIva") || "responsable_inscripto") as DatosProveedor["condicionIva"],
    rubros: f.getAll("rubros").map(String) as Rubro[],
    contacto: txt(f, "contacto"),
    telefono: txt(f, "telefono"),
    whatsapp: txt(f, "whatsapp"),
    email: txt(f, "email"),
    domicilio: txt(f, "domicilio"),
    condicionesPago: txt(f, "condicionesPago"),
    diasPago: Math.round(leerNumero(txt(f, "diasPago")) ?? 0),
    notas: txt(f, "notas"),
  };
  let destino = "";
  const r = await seguro(async () => {
    if (id) {
      await editarProveedor(id, d, await actorDe(u));
      destino = `/proveedores/${id}?aviso=guardado`;
    } else destino = `/proveedores/${await crearProveedor(d, await actorDe(u))}?aviso=creado`;
    return undefined;
  }, "/proveedores");
  if (r?.error) return r;
  redirect(destino);
}

export async function accionPago(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("ver_proveedores");
  const id = Number(f.get("proveedorId"));
  return seguro(async () => {
    const imputaciones = f
      .getAll("imputar")
      .map(String)
      .map((compraId) => ({ compraId: Number(compraId), importe: plata(f, `imp-${compraId}`) }))
      .filter((x) => x.importe > 0);
    const sentido = txt(f, "sentido") === "cobro" ? "cobro" : "pago";
    const origen = leerOrigenPago(f);
    await registrarPago(id, { fecha: new Date(`${txt(f, "fecha")}T12:00:00-03:00`), moneda: txt(f, "moneda") || "ARS", importe: plata(f, "importe"), tipoCambio: leerNumero(txt(f, "tipoCambio")) ?? 1, notas: txt(f, "notas"), imputaciones: sentido === "pago" ? imputaciones : [], sentido, ...origen, medio: origen.medio as keyof typeof MEDIOS_PAGO }, await actorDe(u));
    return { ok: sentido === "pago" ? "Pago registrado." : "Cobro registrado." };
  }, `/proveedores/${id}`);
}

export async function accionAnularPago(f: FormData) {
  const u = await requierePermiso("anular_comprobantes");
  await anularPago(Number(f.get("pagoId")), txt(f, "motivo") || "Anulado desde la ficha", await actorDe(u));
  revalidatePath(`/proveedores/${f.get("proveedorId")}`);
}

export async function accionCcProveedor(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  const id = Number(f.get("proveedorId"));
  return seguro(async () => {
    const signo = txt(f, "sentido") === "nosdebe" ? -1 : 1;
    await movimientoCcProveedorManual(id, { tipo: txt(f, "tipo") as "saldo_inicial", moneda: txt(f, "moneda"), importe: plata(f, "importe") * signo, descripcion: txt(f, "descripcion"), vencimiento: txt(f, "vencimiento") ? new Date(`${txt(f, "vencimiento")}T20:00:00-03:00`) : null }, await actorDe(u));
    return { ok: "Movimiento registrado." };
  }, `/proveedores/${id}`);
}

export async function accionEstadoProveedor(f: FormData) {
  const u = await requierePermiso("configurar_sistema");
  await cambiarEstadoProveedor(Number(f.get("proveedorId")), f.get("activo") === "1", await actorDe(u));
  revalidatePath(`/proveedores/${f.get("proveedorId")}`);
}

export async function accionDevolverConsignacion(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("ver_proveedores");
  return seguro(async () => {
    const ids = f.getAll("productoId").map(Number);
    await devolverAlConsignante(ids, await actorDe(u));
    return { ok: `Se devolvieron ${ids.length} pieza/s al consignante.` };
  }, "/proveedores", "/proveedores/consignaciones", `/proveedores/${f.get("proveedorId")}`);
}

export async function accionEntregar(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("ver_proveedores");
  return seguro(async () => {
    const items = f
      .getAll("productoId")
      .map(Number)
      .map((productoId) => ({ productoId, precioAcordado: plata(f, `precio-${productoId}`) }));
    await entregarEnConsignacion(Number(f.get("terceroId")), items, txt(f, "notas"), await actorDe(u));
    return { ok: `Se entregaron ${items.length} pieza/s en consignación.` };
  }, "/proveedores/consignaciones");
}

export async function accionResolverEntregada(f: FormData) {
  const u = await requierePermiso("ver_proveedores");
  await resolverEntregada(Number(f.get("itemId")), f.get("resultado") === "vendida" ? "vendida" : "devuelta", await actorDe(u));
  revalidatePath("/proveedores/consignaciones");
}

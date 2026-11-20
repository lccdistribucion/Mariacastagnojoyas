"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { autorizarConAdmin } from "@/lib/auth/autorizacion";
import { actorDe, requierePermiso, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { ajustarStock, cambiarEstado, cambiarUbicacion, registrarDevolucion, registrarSalida } from "@/lib/stock/movimientos";
import { crearProducto, editarProducto, obtenerProducto, type DatosProducto } from "@/lib/stock/productos";
import type { EstadoPieza, MotivoAjuste } from "@/lib/stock/tipos";

export type Estado = { ok?: string; error?: string } | undefined;

async function seguro(fn: () => Promise<Estado>): Promise<Estado> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => leerNumero(txt(f, k));
const plata = (f: FormData, k: string) => {
  const n = num(f, k);
  return n == null ? null : Math.round(n * 100);
};
const mg = (f: FormData, k: string) => {
  const n = num(f, k);
  return n == null ? null : Math.round(n * 1000);
};
const id = (f: FormData, k: string) => Number(f.get(k)) || null;

function leerFormulario(f: FormData): DatosProducto {
  let piedras: DatosProducto["piedras"] = [];
  try {
    piedras = JSON.parse(txt(f, "piedras") || "[]");
  } catch {}
  return {
    codigo: txt(f, "codigo"),
    codigoBarras: txt(f, "codigoBarras") || null,
    nombre: txt(f, "nombre"),
    tipo: txt(f, "tipo") as DatosProducto["tipo"],
    categoriaId: id(f, "categoriaId"),
    coleccion: txt(f, "coleccion"),
    artesano: txt(f, "artesano"),
    leyId: id(f, "leyId"),
    metalDetalle: txt(f, "metalDetalle"),
    pesoBrutoMg: mg(f, "pesoBruto"),
    pesoNetoMg: mg(f, "pesoNeto"),
    medidas: txt(f, "medidas"),
    talle: txt(f, "talle"),
    descripcion: txt(f, "descripcion"),
    notasInternas: txt(f, "notasInternas"),
    costoMetal: plata(f, "costoMetal") ?? 0,
    costoManoObra: plata(f, "costoManoObra") ?? 0,
    costoPiedras: plata(f, "costoPiedras") ?? 0,
    costoOtros: plata(f, "costoOtros") ?? 0,
    monedaCosto: (txt(f, "monedaCosto") || "ARS") as DatosProducto["monedaCosto"],
    modoPrecio: txt(f, "modoPrecio") === "gramo" ? "gramo" : "fijo",
    precioLista: plata(f, "precioLista") ?? 0,
    precioOferta: plata(f, "precioOferta"),
    monedaPrecio: (txt(f, "monedaPrecio") || "ARS") as DatosProducto["monedaPrecio"],
    hechura: plata(f, "hechura") ?? 0,
    ivaPct: Number(txt(f, "ivaPct") || 2100),
    tratamientoIva: (txt(f, "tratamientoIva") || "general") as "general" | "bienes_usados" | "exento",
    origen: txt(f, "origen") as DatosProducto["origen"],
    consignante: txt(f, "consignante"),
    proveedorId: id(f, "proveedorId"),
    ubicacionId: id(f, "ubicacionId"),
    cantidad: Math.round(num(f, "cantidad") ?? 1),
    stockMinimo: Math.round(num(f, "stockMinimo") ?? 0),
    piedras,
  };
}

export async function guardarPieza(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("cargar_productos");
  const actor = await actorDe(u);
  const pid = Number(f.get("id")) || null;
  let destino = "";
  const r = await seguro(async () => {
    const d = leerFormulario(f);
    if (pid) {
      const antes = await obtenerProducto(pid);
      if (!antes) throw new ErrorValidacion("La pieza no existe.");
      // Quien no ve costos no los puede pisar: se conservan los guardados.
      if (!u.permisos.has("ver_costos")) Object.assign(d, { costoMetal: antes.costoMetal, costoManoObra: antes.costoManoObra, costoPiedras: antes.costoPiedras, costoOtros: antes.costoOtros, monedaCosto: antes.monedaCosto });
      const cambiaPrecio = antes.precioLista !== d.precioLista || antes.precioOferta !== d.precioOferta || antes.monedaPrecio !== d.monedaPrecio || antes.modoPrecio !== d.modoPrecio || antes.hechura !== d.hechura;
      if (cambiaPrecio && !u.permisos.has("modificar_precios")) throw new ErrorValidacion("Solo el administrador puede cambiar el precio de una pieza ya cargada.");
      await editarProducto(pid, d, actor);
      destino = `/stock/${pid}?aviso=guardada`;
    } else {
      const n = await crearProducto(d, actor);
      destino = `/stock/${n.id}?aviso=creada`;
    }
    return undefined;
  });
  if (r?.error) return r;
  revalidatePath("/stock");
  redirect(destino);
}

/** Ajuste de stock: con el permiso «ajustar_stock», o con usuario y clave de un administrador en el momento. */
export async function accionAjuste(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const actor = await actorDe(u);
  const pid = Number(f.get("id"));
  return seguro(async () => {
    let autorizadoPor: number | null = u.permisos.has("ajustar_stock") ? u.id : null;
    const motivo = txt(f, "motivo") as MotivoAjuste;
    const detalle = txt(f, "detalle");
    if (!autorizadoPor) {
      const a = await autorizarConAdmin(actor, { usuario: txt(f, "adminUsuario"), clave: String(f.get("adminClave") ?? "") }, `ajuste de stock de la pieza ${pid} (${detalle})`);
      if (!a.ok) return { error: a.error };
      autorizadoPor = a.adminId;
    }
    const delta = Math.round(num(f, "delta") ?? 0) * (txt(f, "sentido") === "restar" ? -1 : 1);
    const r = await ajustarStock(pid, { delta, motivo, detalle }, actor, autorizadoPor);
    revalidatePath(`/stock/${pid}`);
    return { ok: `Ajuste registrado. Stock: ${r.cantidad}.` };
  });
}

export async function accionEstado(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const pid = Number(f.get("id"));
  return seguro(async () => {
    await cambiarEstado(pid, txt(f, "estado") as EstadoPieza, txt(f, "nota"), await actorDe(u));
    if (id(f, "ubicacionId")) await cambiarUbicacion(pid, id(f, "ubicacionId")!, await actorDe(u));
    revalidatePath(`/stock/${pid}`);
    return { ok: "Guardado." };
  });
}

export async function accionSalida(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const pid = Number(f.get("id"));
  return seguro(async () => {
    await registrarSalida(
      pid,
      { destino: txt(f, "destino") as "prueba_cliente", detalle: txt(f, "detalle"), responsable: txt(f, "responsable"), devolucionEsperada: new Date(`${txt(f, "vuelve")}T20:00:00-03:00`), notas: txt(f, "notas") },
      await actorDe(u),
    );
    revalidatePath(`/stock/${pid}`);
    revalidatePath("/stock/salidas");
    return { ok: "Salida registrada." };
  });
}

export async function accionDevolucion(f: FormData) {
  const u = await requiereUsuario();
  await registrarDevolucion(Number(f.get("salidaId")), await actorDe(u));
  revalidatePath("/stock", "layout");
}

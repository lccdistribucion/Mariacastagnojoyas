"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorDe, requierePermiso, requiereUsuario } from "@/lib/auth/sesion";
import { agregarDeseo, anularMovimientoCc, cambiarEstadoCliente, crearCliente, editarCliente, ErrorDuplicado, marcarDeseo, movimientoCcManual, type DatosCliente } from "@/lib/clientes/clientes";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { buscarPorCodigo } from "@/lib/stock/productos";

export type Estado = { ok?: string; error?: string; parecidos?: { id: number; nombre: string }[] } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function leer(f: FormData): DatosCliente {
  return {
    nombre: txt(f, "nombre"),
    tipoDoc: (txt(f, "tipoDoc") || null) as DatosCliente["tipoDoc"],
    documento: txt(f, "documento"),
    condicionIva: (txt(f, "condicionIva") || "consumidor_final") as DatosCliente["condicionIva"],
    domicilio: txt(f, "domicilio"),
    localidad: txt(f, "localidad"),
    provincia: txt(f, "provincia"),
    telefono: txt(f, "telefono"),
    whatsapp: txt(f, "whatsapp"),
    email: txt(f, "email"),
    cumpleanos: txt(f, "cumpleanos"),
    aniversario: txt(f, "aniversario"),
    talles: txt(f, "talles"),
    preferencias: txt(f, "preferencias"),
    notas: txt(f, "notas"),
  };
}

export async function guardarCliente(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const actor = await actorDe(u);
  const id = Number(f.get("id")) || null;
  let destino = "";
  try {
    if (id) {
      await editarCliente(id, leer(f), actor);
      destino = `/clientes/${id}?aviso=guardado`;
    } else {
      const nuevo = await crearCliente(leer(f), actor, { aunqueParezcaDuplicado: f.get("confirmarDuplicado") === "1" });
      destino = `/clientes/${nuevo}?aviso=creado`;
    }
  } catch (e) {
    if (e instanceof ErrorDuplicado) return { error: e.message, parecidos: e.parecidos };
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
  revalidatePath("/clientes");
  redirect(destino);
}

async function seguro(fn: () => Promise<Estado>, ruta: string): Promise<Estado> {
  try {
    const r = await fn();
    revalidatePath(ruta);
    return r;
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function accionCcManual(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  const id = Number(f.get("clienteId"));
  return seguro(async () => {
    const n = leerNumero(txt(f, "importe"));
    const signo = txt(f, "sentido") === "favor" ? -1 : 1;
    await movimientoCcManual(id, { tipo: txt(f, "tipo") === "saldo_inicial" ? "saldo_inicial" : "ajuste", importe: n == null ? 0 : Math.round(n * 100) * signo, descripcion: txt(f, "descripcion"), vencimiento: txt(f, "vencimiento") ? new Date(`${txt(f, "vencimiento")}T20:00:00-03:00`) : null }, await actorDe(u));
    return { ok: "Movimiento registrado." };
  }, `/clientes/${id}`);
}

export async function accionAnularCc(f: FormData) {
  const u = await requierePermiso("configurar_sistema");
  await anularMovimientoCc(Number(f.get("movId")), await actorDe(u));
  revalidatePath(`/clientes/${f.get("clienteId")}`);
}

export async function accionDeseo(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(f.get("clienteId"));
  return seguro(async () => {
    const codigo = txt(f, "codigo");
    const p = codigo ? await buscarPorCodigo(codigo) : null;
    if (codigo && !p) return { error: `No existe una pieza con el código ${codigo.toUpperCase()}.` };
    await agregarDeseo(id, { descripcion: txt(f, "descripcion"), productoId: p?.id ?? null }, await actorDe(u));
    return { ok: "Agregado a la lista de deseos." };
  }, `/clientes/${id}`);
}

export async function accionMarcarDeseo(f: FormData) {
  const u = await requiereUsuario();
  await marcarDeseo(Number(f.get("deseoId")), f.get("cumplido") === "1", await actorDe(u));
  revalidatePath(`/clientes/${f.get("clienteId")}`);
}

export async function accionEstadoCliente(f: FormData) {
  const u = await requierePermiso("configurar_sistema");
  const id = Number(f.get("clienteId"));
  await cambiarEstadoCliente(id, f.get("activo") === "1", await actorDe(u));
  revalidatePath(`/clientes/${id}`);
}

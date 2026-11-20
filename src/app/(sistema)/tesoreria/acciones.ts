"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { acreditar } from "@/lib/tesoreria/acreditaciones";
import { anularMovimiento, cambiarDivisas, guardarCaja, guardarCategoria, registrarGastoIngreso, saldoInicial, transferir } from "@/lib/tesoreria/cajas";
import { debitarCheque, depositarCheque, rechazarCheque, recibirCheque } from "@/lib/tesoreria/cheques";
import { confirmarConciliacion, leerExtracto, proponer, registrarLinea, type RenglonExtracto } from "@/lib/tesoreria/conciliacion";

export type Estado = { ok?: string; error?: string } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const plata = (f: FormData, k: string) => Math.round((leerNumero(txt(f, k)) ?? 0) * 100);
const pct = (f: FormData, k: string) => Math.round((leerNumero(txt(f, k)) ?? 0) * 100);
const dia = (f: FormData, k: string) => (txt(f, k) ? new Date(`${txt(f, k)}T12:00:00-03:00`) : new Date());
const admin = async () => actorDe(await requierePermiso("ver_tesoreria"));
/** Vuelve a la pantalla con un aviso (cuando lo que se hizo saca el formulario de la lista). */
const volver = (f: FormData, porDefecto: string, aviso: string) => {
  const v = txt(f, "volver");
  const ruta = v.startsWith("/tesoreria") ? v : porDefecto;
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}aviso=${aviso}`);
};

async function intentar(fn: () => Promise<string>, rutas: string[] = ["/tesoreria"]): Promise<Estado> {
  try {
    const ok = await fn();
    for (const r of rutas) revalidatePath(r, "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function accionOperacion(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  const tipo = txt(f, "operacion");
  return intentar(async () => {
    if (tipo === "gasto" || tipo === "ingreso") {
      await registrarGastoIngreso({ tipo, cajaId: Number(txt(f, "cajaId")), categoriaId: Number(txt(f, "categoriaId")), importe: plata(f, "importe"), descripcion: txt(f, "descripcion"), fecha: dia(f, "fecha") }, actor);
      return tipo === "gasto" ? "Gasto registrado." : "Ingreso registrado.";
    }
    if (tipo === "transferencia") {
      await transferir({ origenId: Number(txt(f, "origenId")), destinoId: Number(txt(f, "destinoId")), importe: plata(f, "importe"), detalle: txt(f, "descripcion") }, actor);
      return "Transferencia registrada.";
    }
    if (tipo === "divisas") {
      const r = await cambiarDivisas({ origenId: Number(txt(f, "origenId")), destinoId: Number(txt(f, "destinoId")), importeOrigen: plata(f, "importeOrigen"), importeDestino: plata(f, "importeDestino"), detalle: txt(f, "descripcion") }, actor);
      return `Operación registrada (cambio ${r.tc.toLocaleString("es-AR", { maximumFractionDigits: 2 })}).`;
    }
    throw new ErrorValidacion("Elegí la operación.");
  });
}

export async function accionAnularMovimiento(f: FormData) {
  const actor = await admin();
  await anularMovimiento(Number(txt(f, "id")), txt(f, "motivo") || "Anulado desde Tesorería", actor);
  revalidatePath("/tesoreria", "layout");
}

export async function accionAcreditar(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  const r = await intentar(async () => {
    const ids = f.getAll("ids").map(Number).filter(Boolean);
    const r = await acreditar({ ids, neto: plata(f, "neto"), retencion: plata(f, "retencion"), fecha: dia(f, "fecha"), bancoId: Number(txt(f, "bancoId")) }, actor);
    return `Acreditación registrada. Comisión de la procesadora: $ ${(r.comision / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`;
  });
  if (r?.ok) volver(f, "/tesoreria/tarjetas", "acreditado");
  return r;
}

export async function accionRecibirCheque(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  return intentar(async () => {
    await recibirCheque(
      { numero: txt(f, "numero"), banco: txt(f, "banco"), librador: txt(f, "librador"), cuit: txt(f, "cuit"), importe: plata(f, "importe"), fechaEmision: dia(f, "emision"), fechaPago: dia(f, "pago"), clienteId: Number(txt(f, "clienteId")) || null, categoriaId: Number(txt(f, "categoriaId")) || null, detalle: txt(f, "detalle"), notas: txt(f, "notas") },
      actor,
    );
    return "Cheque recibido: quedó en la cartera.";
  }, ["/tesoreria", "/clientes"]);
}

export async function accionCheque(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  const id = Number(txt(f, "id"));
  const que = txt(f, "que");
  const r = await intentar(async () => {
    if (que === "depositar") await depositarCheque(id, Number(txt(f, "bancoId")), actor);
    else if (que === "rechazar") await rechazarCheque(id, txt(f, "motivo"), actor);
    else if (que === "debitar") await debitarCheque(id, actor);
    else throw new ErrorValidacion("Acción no válida.");
    return que === "depositar" ? "Cheque depositado." : que === "rechazar" ? "Rechazo registrado." : "Débito registrado.";
  }, ["/tesoreria", "/clientes", "/proveedores"]);
  if (r?.ok) volver(f, "/tesoreria/cheques", que);
  return r;
}

export async function accionCaja(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  const id = Number(txt(f, "id")) || null;
  return intentar(async () => {
    await guardarCaja(
      id,
      { nombre: txt(f, "nombre"), tipo: txt(f, "tipo"), moneda: txt(f, "moneda") || "ARS", arqueo: txt(f, "arqueo") === "1", diasAcreditacion: Math.round(leerNumero(txt(f, "dias")) ?? 0), comisionPct: pct(f, "comision"), retencionPct: pct(f, "retencion"), bancoId: Number(txt(f, "bancoId")) || null, activa: txt(f, "activa") === "1", orden: Number(txt(f, "orden")) || 0 },
      actor,
    );
    return id ? "Caja guardada." : "Caja creada.";
  });
}

export async function accionSaldoInicial(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  const r = await intentar(async () => {
    await saldoInicial(Number(txt(f, "cajaId")), plata(f, "importe"), actor);
    return "Saldo inicial cargado.";
  });
  if (r?.ok) volver(f, "/tesoreria/cajas", "inicial");
  return r;
}

export async function accionCategoria(_p: Estado, f: FormData): Promise<Estado> {
  const actor = await admin();
  return intentar(async () => {
    await guardarCategoria(Number(txt(f, "id")) || null, { nombre: txt(f, "nombre"), tipo: txt(f, "tipo") === "ingreso" ? "ingreso" : "gasto", activa: txt(f, "activa") !== "0" }, actor);
    return "Categoría guardada.";
  });
}

/** Paso 1 de la conciliación: lee el extracto y devuelve la propuesta (no guarda nada). */
export async function accionLeerExtracto(_p: unknown, f: FormData) {
  await admin();
  try {
    const archivo = f.get("archivo");
    if (!(archivo instanceof File) || !archivo.size) throw new ErrorValidacion("Elegí el archivo del extracto.");
    const cajaId = Number(txt(f, "cajaId"));
    const renglones = await leerExtracto(archivo.name, Buffer.from(await archivo.arrayBuffer()));
    return { cajaId, ...(await proponer(cajaId, renglones)) };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function accionConfirmarConciliacion(cajaId: number, renglones: (RenglonExtracto & { movimientoId: number | null })[]): Promise<Estado> {
  const actor = await admin();
  return intentar(async () => {
    const r = await confirmarConciliacion(cajaId, renglones, actor);
    return `Conciliación guardada: ${r.conciliados} coinciden${r.pendientes ? `, ${r.pendientes} renglón/es del banco para revisar` : ""}.`;
  });
}

export async function accionRegistrarLinea(f: FormData) {
  const actor = await admin();
  await registrarLinea(Number(txt(f, "lineaId")), Number(txt(f, "categoriaId")), actor);
  revalidatePath("/tesoreria", "layout");
}

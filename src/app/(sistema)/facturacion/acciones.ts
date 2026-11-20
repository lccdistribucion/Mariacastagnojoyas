"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso, requiereUsuario } from "@/lib/auth/sesion";
import { ErrorValidacion, guardarConfig } from "@/lib/config";
import { leerNumero } from "@/lib/formato";
import { estadoCertificado, generarPedido, guardarCertificado, type AmbienteArca } from "@/lib/arca/certificados";
import { probarConexion } from "@/lib/arca/wsfe";
import { resultadoFiscal as resultado } from "@/lib/facturacion/vista";
import { configuracionFiscal, facturarAPosteriori, facturarVenta, notaCredito, notaDebito, reintentar, reintentarPendientes } from "@/lib/facturacion/emision";
import { guardarPuntoVenta } from "@/lib/facturacion/puntos";

export type Estado = { ok?: string; error?: string; aviso?: string } | undefined;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function intentar(fn: () => Promise<Estado>, rutas = ["/facturacion", "/ventas"]): Promise<Estado> {
  try {
    const r = await fn();
    for (const x of rutas) revalidatePath(x, "layout");
    return r;
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

export async function accionFacturarVenta(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  const id = Number(txt(f, "ventaId"));
  return intentar(async () => resultado(await facturarVenta(id, await actorDe(u))));
}

export async function accionFacturarAPosteriori(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("cargar_sin_facturar");
  const id = Number(txt(f, "ventaId"));
  return intentar(async () => resultado(await facturarAPosteriori(id, await actorDe(u))));
}

export async function accionReintentar(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requiereUsuario();
  return intentar(async () => resultado(await reintentar(Number(txt(f, "id")), await actorDe(u))));
}

export async function accionReintentarTodo(_p: Estado): Promise<Estado> {
  const u = await requierePermiso("ver_ventas_de_todos");
  return intentar(async () => {
    const r = await reintentarPendientes(await actorDe(u));
    return r.pendientes ? { ok: `Se reintentaron ${r.pendientes}: ${r.autorizados} autorizado/s.` } : { ok: "No había pendientes." };
  });
}

/** Anular una venta facturada: nota de crédito por el total; cuando ARCA la autoriza, se anula la venta. */
export async function accionAnularConNotaCredito(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("anular_comprobantes");
  return intentar(async () => {
    const r = await notaCredito({ facturaId: Number(txt(f, "facturaId")), motivo: txt(f, "motivo"), anular: true }, await actorDe(u));
    const base = await resultado(r);
    return r.estado === "autorizado" ? { ok: `${base?.ok} La venta quedó anulada.` } : base;
  });
}

export async function accionNotaDebito(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("ver_ventas_de_todos");
  return intentar(async () => {
    const importe = Math.round((leerNumero(txt(f, "importe")) ?? 0) * 100);
    return resultado(await notaDebito({ clienteId: Number(txt(f, "clienteId")), concepto: txt(f, "concepto"), importe, ivaPct: Number(txt(f, "ivaPct")) || 2100 }, await actorDe(u)));
  }, ["/facturacion", "/clientes"]);
}

export async function accionDatosFiscales(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return intentar(async () => {
    const tope = leerNumero(txt(f, "tope"));
    await guardarConfig(
      {
        "fiscal.condicion_iva": txt(f, "condicion"),
        "fiscal.razon_social": txt(f, "razonSocial"),
        "negocio.cuit": txt(f, "cuit").replace(/\D/g, ""),
        "fiscal.iibb": txt(f, "iibb"),
        "fiscal.inicio_actividades": txt(f, "inicio"),
        "fiscal.tope_sin_identificar": tope == null ? NaN : Math.round(tope * 100),
        "fiscal.emitir_al_vender": txt(f, "alVender") === "1",
        "arca.ambiente": txt(f, "ambiente"),
      },
      await actorDe(u),
    );
    return { ok: "Datos fiscales guardados." };
  });
}

export async function accionPuntoVenta(_p: Estado, f: FormData): Promise<Estado> {
  const u = await requierePermiso("configurar_sistema");
  return intentar(async () => {
    await guardarPuntoVenta(Number(txt(f, "id")) || null, { numero: Number(txt(f, "numero")), nombre: txt(f, "nombre"), activo: txt(f, "activo") === "1", porDefecto: txt(f, "porDefecto") === "1" }, await actorDe(u));
    return { ok: "Punto de venta guardado." };
  });
}

export async function accionSubirCertificado(_p: Estado, f: FormData): Promise<Estado> {
  await requierePermiso("configurar_sistema");
  return intentar(async () => {
    const ambiente = txt(f, "ambiente") as AmbienteArca;
    const archivo = f.get("certificado");
    if (!(archivo instanceof File) || !archivo.size) throw new ErrorValidacion("Elegí el archivo del certificado (.crt).");
    const r = guardarCertificado(ambiente, await archivo.text());
    return { ok: `Certificado cargado. Vence el ${r.vence.toLocaleDateString("es-AR")}.` };
  });
}

export async function accionProbarConexion(_p: Estado, f: FormData): Promise<Estado> {
  await requierePermiso("configurar_sistema");
  return intentar(async () => {
    const ambiente = txt(f, "ambiente") as AmbienteArca;
    if (!estadoCertificado(ambiente).tieneCertificado) throw new ErrorValidacion("Primero cargá el certificado de ese ambiente.");
    const { cuit } = await configuracionFiscal();
    try {
      const pvs = await probarConexion(ambiente, cuit);
      return { ok: `Conexión con ARCA (${ambiente === "produccion" ? "producción" : "homologación"}) correcta. Puntos de venta habilitados para web services: ${pvs.length ? pvs.map((p) => p.numero + (p.bloqueado ? " (bloqueado)" : "")).join(", ") : "ninguno (en homologación es normal)"}.` };
    } catch (e) {
      if (e instanceof ErrorValidacion) throw e;
      throw new ErrorValidacion(`No se pudo conectar con ARCA: ${(e as Error).message}. Revisá la conexión a internet.`);
    }
  });
}

/** Genera el pedido de certificado y lo devuelve como texto (la pantalla lo descarga como .csr). */
export async function accionGenerarPedido(ambiente: AmbienteArca, alias: string) {
  await requierePermiso("configurar_sistema");
  const { leerConfig } = await import("@/lib/config");
  const c = await leerConfig(["negocio.cuit", "fiscal.razon_social", "negocio.nombre"]);
  try {
    return { csr: generarPedido(ambiente, { cuit: c["negocio.cuit"], razonSocial: c["fiscal.razon_social"] || c["negocio.nombre"], alias }) };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

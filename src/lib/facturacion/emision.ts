/**
 * Emisión de comprobantes fiscales: factura de una venta (al confirmarla o «a posteriori» si era interna), notas de
 * crédito (devoluciones y anulaciones) y notas de débito. Se pide el CAE a ARCA o, en modo «simulado», se genera uno
 * de prueba sin validez fiscal para poder usar todo el circuito antes de tener el certificado.
 * Las emisiones se hacen de a una (para que la numeración correlativa no choque) y nunca frenan una venta: si ARCA no
 * responde, el comprobante queda pendiente para reintentar.
 */
import { and, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { clientes, cobros, comprobantesFiscales, db, movimientosCcClientes, productos, puntosVenta, ventaItems, ventas } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion, leerConfig } from "../config";
import { consultarComprobante, solicitarCae, ultimoAutorizado } from "../arca/wsfe";
import { calcularImportes, CODIGOS, CONDICION_RECEPTOR, claseDe, documentoReceptor, letraDe, letraPara, NOMBRE_TIPO, numeroComprobante, type ItemFiscal, type Letra } from "./calculo";

type Comprobante = typeof comprobantesFiscales.$inferSelect;

// Una emisión por vez (la numeración la da ARCA: último + 1).
let cola: Promise<unknown> = Promise.resolve();
function deAUno<T>(fn: () => Promise<T>): Promise<T> {
  const r = cola.then(fn, fn);
  cola = r.catch(() => undefined);
  return r;
}

export async function configuracionFiscal() {
  const c = await leerConfig(["fiscal.condicion_iva", "negocio.cuit", "arca.ambiente", "fiscal.tope_sin_identificar", "fiscal.emitir_al_vender"]);
  return { condicion: c["fiscal.condicion_iva"], cuit: c["negocio.cuit"].replace(/\D/g, ""), ambiente: c["arca.ambiente"], tope: c["fiscal.tope_sin_identificar"], alVender: c["fiscal.emitir_al_vender"] };
}

export async function puntoDeVenta() {
  const pvs = await db.select().from(puntosVenta).where(eq(puntosVenta.activo, true));
  const pv = pvs.find((p) => p.porDefecto) ?? pvs[0];
  if (!pv) throw new ErrorValidacion("Falta cargar el punto de venta de factura electrónica (Facturación → Configuración).");
  return pv.numero;
}

const hoyArca = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).replace(/-/g, "");
const fechaArca = (t: string) => new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T12:00:00-03:00`);
const $ = (c: number) => `$ ${(c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

/** Arma (o rearma, si estaba rechazada o pendiente sin número) la factura de una venta. */
export async function prepararFacturaVenta(ventaId: number, actor: Actor) {
  const cfg = await configuracionFiscal();
  const [v] = await db.select().from(ventas).where(eq(ventas.id, ventaId));
  if (!v) throw new ErrorValidacion("La venta no existe.");
  if (v.anulada) throw new ErrorValidacion("La venta está anulada.");
  if (v.tipoComprobante !== "factura") throw new ErrorValidacion("La venta es interna (sin facturar): usá «Facturar ahora».");
  const previas = await db.select().from(comprobantesFiscales).where(and(eq(comprobantesFiscales.ventaId, ventaId), inArray(comprobantesFiscales.tipo, [1, 6, 11])));
  if (previas.some((p) => p.estado === "autorizado")) throw new ErrorValidacion("Esta venta ya tiene factura.");
  const enCurso = previas.find((p) => p.estado === "pendiente" && p.numero != null);
  if (enCurso) return enCurso.id; // ya se pidió un número: se reintenta tal cual para no duplicar

  const [cli] = v.clienteId ? await db.select().from(clientes).where(eq(clientes.id, v.clienteId)) : [];
  const receptor = cli ? { nombre: cli.nombre, tipoDoc: cli.tipoDoc, documento: cli.documento, condicionIva: cli.condicionIva, domicilio: [cli.domicilio, cli.localidad].filter(Boolean).join(", ") } : null;
  const letra = letraPara(cfg.condicion, receptor);
  const { docTipo, docNro } = documentoReceptor(receptor);
  if (letra === "A" && docTipo !== 80) throw new ErrorValidacion("Para Factura A el cliente tiene que tener CUIT cargado.");

  const its = await db.select({ i: ventaItems, trat: productos.tratamientoIva }).from(ventaItems).leftJoin(productos, eq(productos.id, ventaItems.productoId)).where(eq(ventaItems.ventaId, ventaId));
  const items: (ItemFiscal & { tipo: string; unitario: number })[] = its
    .filter(({ i }) => i.tipo !== "gift_card" && i.cantidad - i.devueltos > 0)
    .map(({ i, trat }) => {
      const cant = i.cantidad - i.devueltos;
      return { descripcion: i.descripcion, cantidad: cant, unitario: i.precioUnitario, subtotal: i.precioUnitario * cant, ivaPct: i.ivaPct, tratamiento: trat ?? "general", costo: i.costoUnitario * cant, tipo: i.tipo };
    });
  if (!items.length) throw new ErrorValidacion("No hay nada para facturar (las gift cards se facturan cuando se usan).");
  const base = items.reduce((s, i) => s + i.subtotal, 0);
  const total = Math.round(base * (1 - v.descuentoPct / 10000)) + v.recargos;
  if (total <= 0) throw new ErrorValidacion("El importe a facturar es cero.");
  if (letra !== "A" && docTipo === 99 && cfg.tope > 0 && total >= cfg.tope) throw new ErrorValidacion(`Desde ${$(cfg.tope)} hay que identificar al comprador: elegí el cliente con su DNI o CUIT.`);
  const imp = calcularImportes(items, total, letra);
  const concepto = items.every((i) => i.tipo === "servicio") ? 2 : items.some((i) => i.tipo === "servicio") ? 3 : 1;

  const divisas = await db.select().from(cobros).where(and(eq(cobros.ventaId, ventaId), eq(cobros.anulado, false), sql`${cobros.moneda} <> 'ARS'`));
  const observaciones = divisas.length ? `Operación pagada en parte en moneda extranjera: ${divisas.map((c) => `${c.moneda} ${(c.importe / 100).toLocaleString("es-AR")} a un tipo de cambio de $ ${(c.tipoCambio / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`).join("; ")}.` : null;
  const datos = {
    ventaId,
    tipo: CODIGOS[letra].factura,
    letra,
    concepto,
    puntoVenta: await puntoDeVenta(),
    numero: null,
    fecha: new Date(),
    clienteId: cli?.id ?? null,
    docTipo,
    docNro,
    receptor: receptor?.nombre ?? "Consumidor final",
    condicionIvaReceptor: CONDICION_RECEPTOR[receptor?.condicionIva ?? "consumidor_final"] ?? 5,
    neto: imp.neto,
    iva: imp.iva,
    exento: imp.exento,
    noGravado: imp.noGravado,
    total: imp.total,
    ivas: JSON.stringify(imp.ivas),
    detalle: JSON.stringify(imp.detalle.map((d) => ({ descripcion: d.descripcion, cantidad: d.cantidad, subtotal: d.subtotal, neto: d.netoItem, iva: d.ivaItem, ivaPct: d.ivaPct, tratamiento: d.tratamiento }))),
    observaciones,
    estado: "pendiente",
    errores: null,
    ambiente: cfg.ambiente,
    usuarioId: actor.id,
    creadoEn: new Date(),
  };
  const reusar = previas.find((p) => p.estado !== "autorizado");
  if (reusar) {
    await db.update(comprobantesFiscales).set(datos).where(eq(comprobantesFiscales.id, reusar.id));
    return reusar.id;
  }
  const [c] = await db.insert(comprobantesFiscales).values(datos).returning({ id: comprobantesFiscales.id });
  return c.id;
}

/** Pide el CAE (o lo simula). Devuelve el comprobante actualizado. Nunca lanza por problemas de conexión. */
export function autorizar(id: number, actor: Actor) {
  return deAUno(async () => {
    const [c] = await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, id));
    if (!c) throw new ErrorValidacion("El comprobante no existe.");
    if (c.estado === "autorizado") return c;
    const cfg = await configuracionFiscal();
    const ahora = new Date();
    const actualizar = (d: Partial<Comprobante>) => db.update(comprobantesFiscales).set({ ...d, intentos: c.intentos + 1, ultimoIntento: ahora }).where(eq(comprobantesFiscales.id, id));
    try {
      if (c.ambiente === "simulado") {
        const [{ m }] = await db.select({ m: max(comprobantesFiscales.numero) }).from(comprobantesFiscales).where(and(eq(comprobantesFiscales.ambiente, "simulado"), eq(comprobantesFiscales.tipo, c.tipo), eq(comprobantesFiscales.puntoVenta, c.puntoVenta)));
        const numero = c.numero ?? (m ?? 0) + 1;
        const cae = `7${String(Math.floor(Math.random() * 1e13)).padStart(13, "0")}`;
        await actualizar({ numero, cae, caeVence: new Date(ahora.getTime() + 10 * 86400_000), estado: "autorizado", errores: null, fecha: ahora });
      } else {
        if (cfg.cuit.length !== 11) throw new ErrorValidacion("Falta el CUIT del negocio (Configuración → Ventas y cobros).");
        const amb = c.ambiente as "homologacion" | "produccion";
        let numero = c.numero;
        if (numero != null) {
          // ¿Se autorizó en un intento anterior cuya respuesta se perdió?
          const prev = await consultarComprobante(amb, cfg.cuit, c.puntoVenta, c.tipo, numero).catch(() => null);
          if (prev?.cae && prev.total === c.total && prev.docNro.replace(/^0+/, "") === c.docNro.replace(/^0+/, "")) {
            await actualizar({ cae: prev.cae, caeVence: fechaArca(prev.caeVence), estado: "autorizado", errores: null });
            return await despues(id, actor);
          }
          const ultimo = await ultimoAutorizado(amb, cfg.cuit, c.puntoVenta, c.tipo);
          if (ultimo >= numero) numero = null;
        }
        if (numero == null) {
          numero = (await ultimoAutorizado(amb, cfg.cuit, c.puntoVenta, c.tipo)) + 1;
          await db.update(comprobantesFiscales).set({ numero, fecha: ahora }).where(eq(comprobantesFiscales.id, id));
        }
        const asociado = c.asociadoId ? (await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, c.asociadoId)))[0] : null;
        const r = await solicitarCae(amb, cfg.cuit, {
          puntoVenta: c.puntoVenta,
          tipo: c.tipo,
          numero,
          concepto: c.concepto as 1 | 2 | 3,
          docTipo: c.docTipo,
          docNro: c.docNro,
          condicionIvaReceptor: c.condicionIvaReceptor,
          fecha: hoyArca(ahora),
          total: c.total,
          noGravado: c.noGravado,
          neto: c.neto,
          exento: c.exento,
          iva: c.iva,
          ivas: JSON.parse(c.ivas),
          asociados: asociado?.numero ? [{ tipo: asociado.tipo, puntoVenta: asociado.puntoVenta, numero: asociado.numero, cuit: cfg.cuit, fecha: hoyArca(asociado.fecha) }] : undefined,
        });
        if (r.resultado === "A" && r.cae) await actualizar({ numero, cae: r.cae, caeVence: r.caeVence ? fechaArca(r.caeVence) : null, estado: "autorizado", errores: r.observaciones.join(" · ") || null, fecha: ahora });
        else await actualizar({ numero: null, estado: "rechazado", errores: [...r.errores, ...r.observaciones].join(" · ") || "ARCA rechazó el comprobante." });
      }
    } catch (e) {
      // Sin respuesta (o error de configuración): queda pendiente para reintentar.
      await actualizar({ estado: "pendiente", errores: e instanceof ErrorValidacion ? e.message : `Sin respuesta de ARCA: ${String((e as Error).message ?? e)}` });
    }
    return despues(id, actor);
  });
}

/** Tras cada intento: estado fiscal de la venta, cuenta corriente (notas de débito), anulación pendiente y auditoría. */
async function despues(id: number, actor: Actor) {
  const [c] = await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, id));
  const clase = claseDe(c.tipo);
  const nombre = `${NOMBRE_TIPO[c.tipo]} ${numeroComprobante(c.puntoVenta, c.numero)}`;
  if (c.ventaId && clase === "factura") await db.update(ventas).set({ estadoFiscal: c.estado === "autorizado" ? "emitido" : c.estado }).where(eq(ventas.id, c.ventaId));
  if (c.estado === "autorizado") {
    if (clase === "nota_debito" && c.clienteId) await db.insert(movimientosCcClientes).values({ clienteId: c.clienteId, fecha: new Date(), tipo: "ajuste", importe: c.total, descripcion: `${nombre}: ${c.motivo ?? ""}`.trim(), documento: `cf:${c.id}`, usuarioId: actor.id });
    if (clase === "nota_credito" && c.motivo?.startsWith("Anulación:") && c.ventaId) {
      const [v] = await db.select().from(ventas).where(eq(ventas.id, c.ventaId));
      if (v && !v.anulada) {
        const { anularVenta } = await import("../ventas/motor");
        await anularVenta(c.ventaId, c.motivo.slice("Anulación:".length).trim() || "Anulada con nota de crédito", actor, { conNotaCredito: true });
      }
    }
  }
  await db.transaction((tx) => auditar(tx, actor, { accion: c.estado === "autorizado" ? "alta" : "modificacion", entidad: "comprobante_fiscal", entidadId: c.id, descripcion: c.estado === "autorizado" ? `${nombre} autorizada${c.ambiente === "simulado" ? " (SIMULADA)" : ""}: ${$(c.total)}, CAE ${c.cae}` : `${NOMBRE_TIPO[c.tipo]} ${c.estado}: ${c.errores ?? ""}` }));
  return c;
}

/** Factura de una venta: prepara y pide el CAE. Si algo falla queda registrado y la venta sigue siendo válida. */
export async function facturarVenta(ventaId: number, actor: Actor) {
  const id = await prepararFacturaVenta(ventaId, actor);
  return autorizar(id, actor);
}

/** Venta interna que se factura después: no vuelve a mover stock ni caja. */
export async function facturarAPosteriori(ventaId: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(ventas).where(eq(ventas.id, ventaId));
    if (!v || v.anulada) throw new ErrorValidacion("La venta no existe o está anulada.");
    if (v.tipoComprobante === "factura") throw new ErrorValidacion("La venta ya es con factura.");
    await tx.update(ventas).set({ tipoComprobante: "factura", estadoFiscal: "pendiente" }).where(eq(ventas.id, ventaId));
    await auditar(tx, actor, { accion: "modificacion", entidad: "venta", entidadId: ventaId, descripcion: `Facturó a posteriori la venta interna N.º ${String(v.numero).padStart(6, "0")} (sin mover stock ni caja)` });
  });
  return facturarVenta(ventaId, actor);
}

/**
 * Nota de crédito sobre una factura autorizada: total (anulación) o parcial (devolución de algunas piezas).
 * Con `anular`, cuando ARCA la autoriza se anula la venta (stock, cobros y caja vuelven).
 */
export async function notaCredito(d: { facturaId: number; importe?: number; items?: { descripcion: string; cantidad: number; subtotal: number }[]; motivo: string; anular?: boolean }, actor: Actor) {
  if (d.motivo.trim().length < 3) throw new ErrorValidacion("Escribí el motivo.");
  const [f] = await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, d.facturaId));
  if (!f || f.estado !== "autorizado" || claseDe(f.tipo) !== "factura") throw new ErrorValidacion("La nota de crédito se hace sobre una factura autorizada.");
  const yaNc = await db.select().from(comprobantesFiscales).where(and(eq(comprobantesFiscales.asociadoId, f.id), inArray(comprobantesFiscales.tipo, [3, 8, 13]), sql`${comprobantesFiscales.estado} <> 'rechazado'`));
  const acreditado = yaNc.reduce((s, x) => s + x.total, 0);
  const total = d.anular ? f.total - acreditado : (d.importe ?? 0);
  if (total <= 0 || acreditado + total > f.total) throw new ErrorValidacion(`El importe supera lo que queda de la factura (${$(f.total - acreditado)}).`);
  const detalleF = JSON.parse(f.detalle) as { descripcion: string; cantidad: number; subtotal: number; ivaPct: number; tratamiento: string }[];
  // Mismo reparto de IVA que la factura, proporcional al importe.
  const items: ItemFiscal[] = d.items?.length
    ? d.items.map((x) => {
        const orig = detalleF.find((y) => y.descripcion === x.descripcion) ?? detalleF[0];
        return { descripcion: x.descripcion, cantidad: x.cantidad, subtotal: x.subtotal, ivaPct: orig.ivaPct, tratamiento: orig.tratamiento === "bienes_usados" ? "general" : orig.tratamiento, costo: 0 };
      })
    : detalleF.map((x) => ({ ...x, tratamiento: x.tratamiento === "bienes_usados" ? "general" : x.tratamiento, costo: 0 }));
  const imp = proporcional(f, total, items);
  const [nc] = await db
    .insert(comprobantesFiscales)
    .values({
      ventaId: f.ventaId,
      tipo: CODIGOS[f.letra as Letra].nota_credito,
      letra: f.letra,
      concepto: f.concepto,
      puntoVenta: f.puntoVenta,
      fecha: new Date(),
      clienteId: f.clienteId,
      docTipo: f.docTipo,
      docNro: f.docNro,
      receptor: f.receptor,
      condicionIvaReceptor: f.condicionIvaReceptor,
      ...imp,
      asociadoId: f.id,
      motivo: d.anular ? `Anulación: ${d.motivo.trim()}` : d.motivo.trim(),
      estado: "pendiente",
      ambiente: f.ambiente,
      usuarioId: actor.id,
      creadoEn: new Date(),
    })
    .returning({ id: comprobantesFiscales.id });
  return autorizar(nc.id, actor);
}

/** Importes de una nota sobre una factura: si es por el total, copia la factura; si no, recalcula por ítem. */
function proporcional(f: Comprobante, total: number, items: ItemFiscal[]) {
  if (total === f.total) return { neto: f.neto, iva: f.iva, exento: f.exento, noGravado: f.noGravado, total: f.total, ivas: f.ivas, detalle: f.detalle };
  const imp = calcularImportes(items, total, f.letra as Letra);
  return { neto: imp.neto, iva: imp.iva, exento: imp.exento, noGravado: imp.noGravado, total: imp.total, ivas: JSON.stringify(imp.ivas), detalle: JSON.stringify(imp.detalle.map((x) => ({ descripcion: x.descripcion, cantidad: x.cantidad, subtotal: x.subtotal, neto: x.netoItem, iva: x.ivaItem, ivaPct: x.ivaPct, tratamiento: x.tratamiento }))) };
}

/** Nota de débito a un cliente (por ejemplo, intereses o un cheque rechazado). Al autorizarse suma a su cuenta corriente. */
export async function notaDebito(d: { clienteId: number; concepto: string; importe: number; ivaPct: number; facturaId?: number | null }, actor: Actor) {
  if (d.concepto.trim().length < 3) throw new ErrorValidacion("Escribí el concepto.");
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new ErrorValidacion("Indicá el importe.");
  const cfg = await configuracionFiscal();
  const [cli] = await db.select().from(clientes).where(eq(clientes.id, d.clienteId));
  if (!cli) throw new ErrorValidacion("Elegí el cliente.");
  const receptor = { nombre: cli.nombre, tipoDoc: cli.tipoDoc, documento: cli.documento, condicionIva: cli.condicionIva };
  const letra = letraPara(cfg.condicion, receptor);
  const { docTipo, docNro } = documentoReceptor(receptor);
  if (letra === "A" && docTipo !== 80) throw new ErrorValidacion("Para comprobantes A el cliente tiene que tener CUIT cargado.");
  const imp = calcularImportes([{ descripcion: d.concepto.trim(), cantidad: 1, subtotal: d.importe, ivaPct: d.ivaPct, tratamiento: "general", costo: 0 }], d.importe, letra);
  const [nd] = await db
    .insert(comprobantesFiscales)
    .values({
      tipo: CODIGOS[letra].nota_debito,
      letra,
      concepto: 2,
      puntoVenta: await puntoDeVenta(),
      fecha: new Date(),
      clienteId: cli.id,
      docTipo,
      docNro,
      receptor: cli.nombre,
      condicionIvaReceptor: CONDICION_RECEPTOR[cli.condicionIva] ?? 5,
      neto: imp.neto,
      iva: imp.iva,
      exento: imp.exento,
      noGravado: imp.noGravado,
      total: imp.total,
      ivas: JSON.stringify(imp.ivas),
      detalle: JSON.stringify(imp.detalle.map((x) => ({ descripcion: x.descripcion, cantidad: 1, subtotal: x.subtotal, neto: x.netoItem, iva: x.ivaItem, ivaPct: x.ivaPct, tratamiento: "general" }))),
      asociadoId: d.facturaId ?? null,
      motivo: d.concepto.trim(),
      estado: "pendiente",
      ambiente: cfg.ambiente,
      usuarioId: actor.id,
      creadoEn: new Date(),
    })
    .returning({ id: comprobantesFiscales.id });
  return autorizar(nd.id, actor);
}

/** Reintenta lo que quedó pendiente (botón y tarea diaria). */
export async function reintentarPendientes(actor: Actor) {
  const pend = await db.select({ id: comprobantesFiscales.id }).from(comprobantesFiscales).where(eq(comprobantesFiscales.estado, "pendiente"));
  let ok = 0;
  for (const p of pend) if ((await autorizar(p.id, actor)).estado === "autorizado") ok++;
  return { pendientes: pend.length, autorizados: ok };
}

/** Reintentar uno: si estaba rechazado y es de una venta, se vuelve a armar con los datos actuales del cliente. */
export async function reintentar(id: number, actor: Actor) {
  const [c] = await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, id));
  if (!c) throw new ErrorValidacion("El comprobante no existe.");
  if (c.estado === "autorizado") return c;
  if (c.ventaId && claseDe(c.tipo) === "factura" && c.numero == null) return autorizar(await prepararFacturaVenta(c.ventaId, actor), actor);
  return autorizar(id, actor);
}

export async function comprobantesDeVenta(ventaId: number) {
  return db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.ventaId, ventaId)).orderBy(comprobantesFiscales.id);
}

export async function obtenerComprobante(id: number) {
  const [c] = await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, id));
  if (!c) return null;
  const asociado = c.asociadoId ? (await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, c.asociadoId)))[0] : null;
  const [cli] = c.clienteId ? await db.select().from(clientes).where(eq(clientes.id, c.clienteId)) : [];
  return { ...c, asociado, cliente: cli ?? null };
}

export async function listarComprobantes(f: { desde?: Date; hasta?: Date; estado?: string; tipo?: number; texto?: string; limite?: number }) {
  const c = [];
  if (f.desde) c.push(sql`${comprobantesFiscales.fecha} >= ${f.desde.getTime()}`);
  if (f.hasta) c.push(sql`${comprobantesFiscales.fecha} <= ${f.hasta.getTime()}`);
  if (f.estado) c.push(eq(comprobantesFiscales.estado, f.estado));
  if (f.tipo) c.push(eq(comprobantesFiscales.tipo, f.tipo));
  if (f.texto?.trim()) c.push(sql`(${comprobantesFiscales.receptor} like ${`%${f.texto.trim()}%`} or ${comprobantesFiscales.docNro} like ${`%${f.texto.trim()}%`})`);
  return db.select().from(comprobantesFiscales).where(c.length ? and(...c) : undefined).orderBy(desc(comprobantesFiscales.fecha), desc(comprobantesFiscales.id)).limit(f.limite ?? 500);
}

void isNotNull;

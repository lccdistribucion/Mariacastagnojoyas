import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db, vales } from "@/db";
import { Aviso, clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { completar } from "@/lib/clientes/recordatorios";
import { leerConfig } from "@/lib/config";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { enlaceWhatsapp } from "@/lib/identidad";
import { obtenerVenta } from "@/lib/ventas/consultas";
import { listarCajas } from "@/lib/tesoreria/cajas";
import { BotonFiscal, FormAnular, FormAnularConNotaCredito, FormDevolucion } from "./paneles";
import { NOMBRE_TIPO, numeroComprobante } from "@/lib/facturacion/calculo";
import { comprobantesDeVenta } from "@/lib/facturacion/emision";

export const metadata = { title: "Venta" };
const $ = (c: number) => `$ ${numero(c / 100, 2)}`;
const FORMAS: Record<string, string> = { vale: "Vale de cambio", cuenta_corriente: "Saldo a favor en cuenta corriente", reintegro: "Reintegro de dinero" };

export default async function FichaVenta({ params }: { params: Promise<{ id: string }> }) {
  const u = await requiereUsuario();
  const v = await obtenerVenta(Number((await params).id));
  if (!v) notFound();
  if (v.tipoComprobante === "interno" && !u.permisos.has("ver_sin_facturar")) notFound();
  if (v.vendedorId !== u.id && !u.permisos.has("ver_ventas_de_todos")) notFound();
  const puedeAnular = u.permisos.has("anular_comprobantes");
  const fiscales = await comprobantesDeVenta(v.id);
  const factura = fiscales.find((c) => [1, 6, 11].includes(c.tipo) && c.estado === "autorizado");
  const cfg = await leerConfig(["mensajes.comprobante"]);
  const nro = String(v.numero).padStart(6, "0");
  const wa = v.cliente?.whatsapp ? enlaceWhatsapp(v.cliente.whatsapp, completar(cfg["mensajes.comprobante"], { nombre: v.cliente.nombre.split(" ")[0], numero: nro })) : null;
  const hasta = new Date(v.fecha);
  hasta.setMonth(hasta.getMonth() + v.garantiaMeses);
  const idsVales = v.devoluciones.map((d) => d.valeId).filter((x): x is number => x != null);
  const codigos = idsVales.length ? await db.select({ id: vales.id, codigo: vales.codigo }).from(vales).where(inArray(vales.id, idsVales)) : [];
  const cajasPesos = (await listarCajas()).filter((c) => c.moneda === "ARS" && ["efectivo", "banco", "billetera"].includes(c.tipo)).map((c) => ({ id: c.id, nombre: c.nombre }));
  const devolvibles = v.items.filter(({ i }) => i.tipo === "pieza" && i.devueltos < i.cantidad);
  const fila = (t: string, val: string, fuerte = false) => (
    <div className={`flex justify-between gap-4 text-sm ${fuerte ? "border-t border-linea pt-2 font-medium" : ""}`}>
      <dt className={fuerte ? "" : "text-gris"}>{t}</dt>
      <dd className={`tabular-nums ${fuerte ? "titulo-serif text-2xl" : ""}`}>{val}</dd>
    </div>
  );
  return (
    <>
      <Encabezado
        titulo={`Venta N.º ${nro}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            {fechaHora(v.fecha)} · {v.vendedor ?? "—"}
            {v.anulada && <Etiqueta tono="error">Anulada</Etiqueta>}
            {v.tipoComprobante === "interno" ? <Etiqueta tono="champagne">Sin facturar</Etiqueta> : v.estadoFiscal === "emitido" ? <Etiqueta tono="ok">Facturada</Etiqueta> : v.estadoFiscal === "rechazado" ? <Etiqueta tono="error">Factura rechazada</Etiqueta> : <Etiqueta tono="alerta">Factura pendiente</Etiqueta>}
          </span>
        }
      />
      {v.anulada && <div className="mb-5"><Aviso tono="error">Anulada: {v.motivoAnulacion}</Aviso></div>}
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-3 font-medium">Detalle</h2>
            <ul className="divide-y divide-linea">
              {v.items.map(({ i, p }) => (
                <li key={i.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    {p ? <Link href={`/stock/${p.id}`} className="underline-offset-2 hover:underline">{i.descripcion}</Link> : i.descripcion}
                    <span className="block text-xs text-gris">
                      {i.cantidad > 1 ? `${i.cantidad} × ${$(i.precioUnitario)}` : ""}
                      {i.devueltos ? ` Devuelto: ${i.devueltos}` : ""}
                      {i.liberado ? " (vuelta al stock)" : ""}
                    </span>
                  </span>
                  <span className="tabular-nums whitespace-nowrap">{$(i.subtotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t border-linea px-5 py-4">
              {fila("Subtotal", $(v.subtotal))}
              {v.descuento > 0 && fila(`Descuento ${numero(v.descuentoPct / 100, v.descuentoPct % 100 ? 1 : 0)} %`, `−${$(v.descuento)}`)}
              {v.canje > 0 && fila("Canje de metal", `−${$(v.canje)}`)}
              {v.recargos !== 0 && fila(v.recargos > 0 ? "Recargos por medio de pago" : "Descuentos por medio de pago", $(v.recargos))}
              {fila("Total", $(v.total + v.recargos), true)}
            </dl>
          </Tarjeta>
          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-3 font-medium">Cobro</h2>
            <ul className="divide-y divide-linea">
              {v.pagos.map(({ c, medio }) => (
                <li key={c.id} className={`flex justify-between gap-3 px-5 py-3 text-sm ${c.anulado ? "text-gris line-through" : ""}`}>
                  <span>
                    {medio}
                    {c.cuotas && c.cuotas > 1 ? ` · ${c.cuotas} cuotas` : ""}
                    {c.moneda !== "ARS" && <span className="block text-xs text-gris">{c.moneda} {numero(c.importe / 100, 2)} a {numero(c.tipoCambio / 1_000_000, 2)}</span>}
                    {c.recargo !== 0 && <span className="block text-xs text-gris">{c.recargo > 0 ? "Recargo" : "Descuento"} {$(Math.abs(c.recargo))}</span>}
                  </span>
                  <span className="tabular-nums">{$(c.aplicado + c.recargo)}</span>
                </li>
              ))}
              {v.aCuentaCorriente > 0 && <li className="flex justify-between px-5 py-3 text-sm"><span>Cuenta corriente</span><span className="tabular-nums">{$(v.aCuentaCorriente)}</span></li>}
            </ul>
          </Tarjeta>
          {v.devoluciones.length > 0 && (
            <Tarjeta>
              <h2 className="border-b border-linea px-5 py-3 font-medium">Devoluciones y cambios</h2>
              <ul className="divide-y divide-linea">
                {v.devoluciones.map((d) => (
                  <li key={d.id} className="px-5 py-3 text-sm">
                    {fecha(d.fecha)} · {FORMAS[d.forma] ?? d.forma}{d.valeId ? <strong className="font-mono"> {codigos.find((x) => x.id === d.valeId)?.codigo}</strong> : null} · <span className="tabular-nums">{$(d.importe)}</span>
                    <span className="block text-xs text-gris">{d.motivo}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
        <div className="flex flex-col gap-5">
          <Tarjeta className="p-5">
            <p className="text-xs text-gris">Cliente</p>
            <p className="font-medium">{v.cliente ? <Link href={`/clientes/${v.cliente.id}`} className="underline-offset-2 hover:underline">{v.cliente.nombre}</Link> : "Consumidor final"}</p>
            {v.garantiaMeses > 0 && <p className="mt-2 text-sm text-gris">Garantía de {v.garantiaMeses} meses, hasta el {fecha(hasta)}.</p>}
            {v.notas && <p className="mt-2 text-sm whitespace-pre-line">{v.notas}</p>}
          </Tarjeta>
          <Tarjeta className="p-5">
            <h2 className="mb-3 font-medium">Facturación</h2>
            {fiscales.length > 0 && (
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {fiscales.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {NOMBRE_TIPO[c.tipo]} {numeroComprobante(c.puntoVenta, c.numero)}
                      <Etiqueta tono={c.estado === "autorizado" ? "ok" : c.estado === "rechazado" ? "error" : "alerta"}>{c.estado === "autorizado" ? "Autorizada" : c.estado === "rechazado" ? "Rechazada" : "Pendiente"}</Etiqueta>
                      {c.ambiente === "simulado" && <Etiqueta>Simulada</Etiqueta>}
                      <span className="tabular-nums">$ {numero(c.total / 100, 2)}</span>
                    </span>
                    {c.estado === "autorizado" && <span className="text-xs text-gris">CAE {c.cae} · vence {c.caeVence ? fecha(c.caeVence) : "—"} · <a href={`/documentos/factura/${c.id}`} target="_blank" className="underline">PDF</a></span>}
                    {c.estado !== "autorizado" && c.errores && <span className="text-xs text-error">{c.errores}</span>}
                    {c.estado !== "autorizado" && !v.anulada && <BotonFiscal que="reintentar" id={c.id} texto="Reintentar" />}
                  </li>
                ))}
              </ul>
            )}
            {!v.anulada && v.tipoComprobante === "factura" && !fiscales.some((c) => [1, 6, 11].includes(c.tipo)) && <BotonFiscal que="facturar" id={v.id} texto="Emitir la factura" variante="primario" />}
            {!v.anulada && v.tipoComprobante === "interno" && u.permisos.has("cargar_sin_facturar") && (
              <>
                <p className="mb-2 text-sm text-gris">Venta interna, sin comprobante fiscal. Se puede facturar ahora sin volver a mover stock ni caja.</p>
                <BotonFiscal que="posteriori" id={v.id} texto="Facturar ahora" />
              </>
            )}
            {v.tipoComprobante === "factura" && !fiscales.length && v.anulada && <p className="text-sm text-gris">Se anuló antes de facturarse.</p>}
          </Tarjeta>
          <div className="grid grid-cols-2 gap-2">
            {factura ? <a href={`/documentos/factura/${factura.id}`} target="_blank" className={clasesBoton("primario")}>Factura</a> : <a href={`/documentos/comprobante/${v.id}`} target="_blank" className={clasesBoton("primario")}>Comprobante</a>}
            <a href={`/documentos/garantia/${v.id}`} target="_blank" className={clasesBoton("secundario")}>Garantía</a>
            <a href={`/documentos/remito/${v.id}`} target="_blank" className={clasesBoton("secundario")}>Remito</a>
            {wa ? <a href={wa} target="_blank" rel="noopener" className={clasesBoton("secundario")}>WhatsApp</a> : <span className={clasesBoton("secundario", "pointer-events-none opacity-50")} title="El cliente no tiene WhatsApp cargado">WhatsApp</span>}
          </div>
          {wa && <p className="-mt-3 text-xs text-gris">WhatsApp abre el mensaje para el cliente; adjuntale el PDF del comprobante que descargaste.</p>}
          {!v.anulada && puedeAnular && devolvibles.length > 0 && (
            <details className="rounded-xl border border-linea bg-superficie p-5">
              <summary className="cursor-pointer font-medium">Devolución o cambio</summary>
              <div className="pt-4"><FormDevolucion ventaId={v.id} conCliente={!!v.clienteId} cajas={cajasPesos} items={devolvibles.map(({ i }) => ({ id: i.id, descripcion: i.descripcion, max: i.cantidad - i.devueltos, unitario: i.precioUnitario }))} /></div>
            </details>
          )}
          {!v.anulada && puedeAnular && (
            <details className="rounded-xl border border-error/30 bg-superficie p-5">
              <summary className="cursor-pointer font-medium text-error">Anular la venta</summary>
              <div className="pt-4">{factura ? <FormAnularConNotaCredito facturaId={factura.id} /> : <FormAnular ventaId={v.id} />}</div>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

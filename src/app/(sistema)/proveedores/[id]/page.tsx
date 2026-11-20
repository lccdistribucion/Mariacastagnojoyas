import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, BotonLink, clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { listarLeyes, obtenerVigentes } from "@/lib/cotizaciones/vigentes";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { listarCajas } from "@/lib/tesoreria/cajas";
import { listarCheques } from "@/lib/tesoreria/cheques";
import { CONDICIONES_IVA, formatoCuit } from "@/lib/identidad";
import { pendientes, TIPOS_COMPROBANTE } from "@/lib/proveedores/compras";
import { consignacionRecibida } from "@/lib/proveedores/consignaciones";
import { obtenerProveedor, RUBROS } from "@/lib/proveedores/proveedores";
import { importe, saldoTexto, TIPOS_CC_PROV } from "@/lib/proveedores/vista";
import { ESTADOS, type EstadoPieza } from "@/lib/stock/tipos";
import { accionAnularPago, accionEstadoProveedor } from "../acciones";
import { DevolverConsignadas, FormCcProveedor, FormPago } from "./paneles";

export const metadata = { title: "Proveedor" };

export default async function FichaProveedor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const u = await requiereUsuario();
  const p = await obtenerProveedor(Number((await params).id));
  if (!p) notFound();
  const { aviso } = await searchParams;
  const [pend, consignadas, vig, cajasP, cartera, leyesP] = await Promise.all([pendientes(p.id), consignacionRecibida(p.id), obtenerVigentes(), listarCajas(), listarCheques({ tipo: "tercero", estados: ["en_cartera"] }), listarLeyes(true)]);
  const admin = u.permisos.has("configurar_sistema");
  const enStock = consignadas.filter((x) => ["disponible", "reservado"].includes(x.p.estado));
  const esRevendedor = p.rubros.includes("revendedor");

  return (
    <>
      <Encabezado
        titulo={p.razonSocial}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            {p.rubros.map((r) => <Etiqueta key={r}>{RUBROS[r]?.split(" (")[0]}</Etiqueta>)}
            {!p.activo && <Etiqueta tono="error">Desactivado</Etiqueta>}
            {p.esDemo && <Etiqueta>Ejemplo</Etiqueta>}
          </span>
        }
        acciones={
          <>
            <BotonLink href={`/proveedores/compras/nueva?proveedor=${p.id}`}>Cargar compra</BotonLink>
            <BotonLink href={`/proveedores/${p.id}/editar`} variante="secundario">Editar</BotonLink>
          </>
        }
      />
      {aviso === "creado" && <div className="mb-5"><Aviso tono="ok">Proveedor dado de alta.</Aviso></div>}
      {aviso === "guardado" && <div className="mb-5"><Aviso tono="ok">Cambios guardados.</Aviso></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-5">
          <Tarjeta className="p-5 text-sm">
            <dl className="grid gap-2">
              {[
                ["CUIT", p.cuit && formatoCuit(p.cuit)],
                ["Condición IVA", CONDICIONES_IVA[p.condicionIva as keyof typeof CONDICIONES_IVA]],
                ["Contacto", p.contacto],
                ["WhatsApp", p.whatsapp && <a key="w" href={`https://wa.me/${p.whatsapp}`} target="_blank" rel="noopener" className="underline">+{p.whatsapp}</a>],
                ["Teléfono", p.telefono],
                ["Email", p.email],
                ["Domicilio", p.domicilio],
                ["Condiciones de pago", p.condicionesPago],
                ["Días de pago", p.diasPago ? `${p.diasPago} días` : null],
              ]
                .filter(([, v]) => v)
                .map(([t, v]) => (
                  <div key={String(t)} className="flex justify-between gap-4 border-b border-linea pb-2 last:border-0"><dt className="text-gris">{t}</dt><dd className="text-right">{v}</dd></div>
                ))}
            </dl>
            {p.notas && <p className="mt-3 whitespace-pre-line text-tinta-suave">{p.notas}</p>}
          </Tarjeta>

          {consignadas.length > 0 && (
            <Tarjeta className="p-5">
              <h2 className="font-medium">Piezas suyas en consignación</h2>
              <p className="mt-1 mb-3 text-xs text-gris">No generan deuda hasta que se venden. {consignadas.filter((x) => x.p.estado === "vendido").length} vendidas · {enStock.length} en stock · {consignadas.filter((x) => x.p.estado === "devuelto").length} devueltas.</p>
              {enStock.length > 0 ? <DevolverConsignadas proveedorId={p.id} piezas={enStock.map((x) => ({ id: x.p.id, codigo: x.p.codigo, nombre: x.p.nombre }))} /> : <p className="text-sm text-gris">Ninguna en stock.</p>}
            </Tarjeta>
          )}

          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-4 font-medium">Compras</h2>
            <ul className="divide-y divide-linea">
              {p.compras.map((c) => (
                <li key={c.id}>
                  <Link href={`/proveedores/compras/${c.id}`} className={`flex justify-between gap-3 px-5 py-3 text-sm hover:bg-papel/60 ${c.anulada ? "text-gris line-through" : ""}`}>
                    <span>{fecha(c.fecha)} · {TIPOS_COMPROBANTE[c.tipoComprobante as keyof typeof TIPOS_COMPROBANTE]}{c.numero != null ? ` ${c.numero}` : ""}</span>
                    <span className="tabular-nums">{importe(c.total, c.moneda)}</span>
                  </Link>
                </li>
              ))}
              {!p.compras.length && <li className="px-5 py-6 text-center text-sm text-gris">Todavía no hay compras.</li>}
            </ul>
          </Tarjeta>
        </div>

        <div className="flex flex-col gap-5">
          <Tarjeta>
            <div className="border-b border-linea px-5 py-4">
              <h2 className="font-medium">Cuenta corriente</h2>
              <p className="titulo-serif mt-1 text-2xl">{saldoTexto(p.saldos) || "Sin saldo"}</p>
            </div>
            <details className="border-b border-linea px-5 py-3" open={pend.length > 0}>
              <summary className="cursor-pointer text-sm font-medium">{esRevendedor ? "Registrar pago o cobro" : "Registrar un pago"}{pend.length ? ` · ${pend.length} factura/s pendientes` : ""}</summary>
              <div className="pt-4">
                <FormPago
                  proveedorId={p.id}
                  esRevendedor={esRevendedor}
                  cotizacionUsd={vig.USD_BLUE.venta}
                  cajas={cajasP.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda, tipo: c.tipo }))}
                  cheques={cartera.map(({ c }) => ({ id: c.id, importe: c.importe, texto: `N.º ${c.numero} · ${c.banco} · $ ${numero(c.importe / 100, 2)} · paga ${fecha(c.fechaPago)}` }))}
                  leyes={leyesP.map((l) => ({ id: l.id, nombre: l.nombre }))}
                  pendientes={pend.map((x) => ({ id: x.id, moneda: x.moneda, pendiente: x.pendiente, vencimiento: x.vencimiento?.getTime() ?? null, descripcion: `${fecha(x.fecha)} ${TIPOS_COMPROBANTE[x.tipoComprobante as keyof typeof TIPOS_COMPROBANTE]}${x.numero != null ? ` ${x.numero}` : ""}` }))}
                />
              </div>
            </details>
            <ul className="divide-y divide-linea">
              {p.cc.map((m) => (
                <li key={m.id} className={`flex items-start justify-between gap-3 px-5 py-3 text-sm ${m.anulado ? "text-gris line-through" : ""}`}>
                  <span>
                    <span className="font-medium">{TIPOS_CC_PROV[m.tipo] ?? m.tipo}</span> · {m.descripcion}
                    <span className="block text-xs text-gris">{fechaHora(m.fecha)}{m.vencimiento ? ` · vence ${fecha(m.vencimiento)}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`whitespace-nowrap tabular-nums ${m.importe > 0 ? "text-error" : "text-ok"}`}>{m.importe > 0 ? "+" : "−"}{importe(Math.abs(m.importe), m.moneda)}</span>
                    {!m.anulado && m.pagoId && u.permisos.has("anular_comprobantes") && (
                      <form action={accionAnularPago}><input type="hidden" name="pagoId" value={m.pagoId} /><input type="hidden" name="proveedorId" value={p.id} /><button className="text-xs text-gris hover:text-error">Anular</button></form>
                    )}
                  </span>
                </li>
              ))}
              {!p.cc.length && <li className="px-5 py-6 text-center text-sm text-gris">Sin movimientos.</li>}
            </ul>
            {admin && (
              <details className="border-t border-linea px-5 py-3">
                <summary className="cursor-pointer text-sm text-gris hover:text-tinta">Cargar saldo inicial, nota de crédito o ajuste</summary>
                <div className="pt-4"><FormCcProveedor proveedorId={p.id} /></div>
              </details>
            )}
          </Tarjeta>
          {consignadas.some((x) => x.p.estado === "vendido") && (
            <Tarjeta className="p-5 text-sm">
              <h2 className="mb-2 font-medium">Vendidas en consignación</h2>
              <ul>{consignadas.filter((x) => x.p.estado === "vendido").map((x) => <li key={x.p.id}>{x.p.codigo} · {x.p.nombre} <span className="text-gris">({ESTADOS[x.p.estado as EstadoPieza]})</span></li>)}</ul>
            </Tarjeta>
          )}
          {admin && (
            <form action={accionEstadoProveedor}>
              <input type="hidden" name="proveedorId" value={p.id} /><input type="hidden" name="activo" value={p.activo ? "0" : "1"} />
              <button className={clasesBoton("fantasma")}>{p.activo ? "Desactivar proveedor" : "Reactivar proveedor"}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

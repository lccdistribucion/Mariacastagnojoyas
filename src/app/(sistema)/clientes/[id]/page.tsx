import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, BotonLink, clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { obtenerCliente } from "@/lib/clientes/clientes";
import { completar } from "@/lib/clientes/recordatorios";
import { leerConfig } from "@/lib/config";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { CONDICIONES_IVA, enlaceWhatsapp, formatoCuit } from "@/lib/identidad";
import { accionAnularCc, accionEstadoCliente, accionMarcarDeseo } from "../acciones";
import { listarPedidos, ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/taller/pedidos";
import { listarReparaciones, ESTADOS_REPARACION, type EstadoReparacion } from "@/lib/taller/reparaciones";
import { cotizacionesCobro, senasDeCliente } from "@/lib/ventas/cobros";
import { garantiasVigentes, ventasDeCliente } from "@/lib/ventas/consultas";
import { listarMedios } from "@/lib/ventas/medios";
import { FormCcManual, FormCobroCc, FormDeseo, FormDevolverSaldo } from "./paneles";
import { listarCajas } from "@/lib/tesoreria/cajas";

export const metadata = { title: "Cliente" };
const $ = (c: number) => `$ ${numero(Math.abs(c) / 100, 0)}`;
const diaMes = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}${f.slice(0, 4) !== "1900" ? `/${f.slice(0, 4)}` : ""}` : null);
const TIPOS_CC: Record<string, string> = { saldo_inicial: "Saldo inicial", ajuste: "Ajuste", venta: "Venta", cobro: "Cobro", nota_credito: "Nota de crédito" };

export default async function FichaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const u = await requiereUsuario();
  const c = await obtenerCliente(Number((await params).id));
  if (!c) notFound();
  const { aviso } = await searchParams;
  const admin = u.permisos.has("configurar_sistema");
  const cfg = await leerConfig(["mensajes.saldo"]);
  const verInternas = u.permisos.has("ver_sin_facturar");
  const verTodas = u.permisos.has("ver_ventas_de_todos");
  const [ventasC, reps, peds, garantias, medios, cot, senas] = await Promise.all([ventasDeCliente(c.id), listarReparaciones(undefined, c.id), listarPedidos(undefined, c.id), garantiasVigentes(c.id), listarMedios(), cotizacionesCobro(), senasDeCliente(c.id)]);
  const NOMBRE_REF: Record<string, string> = { reserva: "reserva", pedido: "pedido", reparacion: "reparación" };
  const textoSena = (ref: string) => {
    const [t, id] = ref.split(":");
    const n = t === "pedido" ? peds.find((x) => x.p.id === Number(id))?.p.numero : t === "reparacion" ? reps.find((x) => x.r.id === Number(id))?.r.numero : id;
    return `${NOMBRE_REF[t] ?? t} N.º ${n ?? id}`;
  };
  const compras = ventasC.filter((v) => (verInternas || v.tipoComprobante !== "interno") && (verTodas || v.vendedorId === u.id));
  const historial = [
    ...compras.map((v) => ({ fecha: v.fecha, href: `/ventas/${v.id}`, texto: `Compra N.º ${String(v.numero).padStart(6, "0")}${v.anulada ? " (anulada)" : ""}`, importe: v.anulada ? null : v.total + v.recargos })),
    ...reps.map(({ r }) => ({ fecha: r.fechaIngreso, href: `/taller/${r.id}`, texto: `Reparación N.º ${r.numero}: ${r.descripcion} · ${ESTADOS_REPARACION[r.estado as EstadoReparacion]}`, importe: r.presupuesto })),
    ...peds.map(({ p }) => ({ fecha: p.fecha, href: `/taller/pedidos/${p.id}`, texto: `Pedido N.º ${p.numero}: ${p.descripcion} · ${ESTADOS_PEDIDO[p.estado as EstadoPedido]}`, importe: p.modoPrecio === "congelado" ? p.presupuesto : null })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const saludo = c.whatsapp ? enlaceWhatsapp(c.whatsapp, `Hola ${c.nombre.split(" ")[0]}, te escribimos de María Castagno.`) : null;
  const avisoSaldo = c.whatsapp && c.saldo > 0 ? enlaceWhatsapp(c.whatsapp, completar(cfg["mensajes.saldo"], { nombre: c.nombre.split(" ")[0], saldo: $(c.saldo) })) : null;
  const dato = (t: string, v: React.ReactNode) =>
    v ? (
      <div className="flex justify-between gap-4 border-b border-linea py-2 text-sm last:border-0">
        <dt className="text-gris">{t}</dt>
        <dd className="text-right">{v}</dd>
      </div>
    ) : null;

  return (
    <>
      <Encabezado
        titulo={c.nombre}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            {CONDICIONES_IVA[c.condicionIva as keyof typeof CONDICIONES_IVA]}
            {!c.activo && <Etiqueta>Desactivado</Etiqueta>}
            {c.esDemo && <Etiqueta>Ejemplo</Etiqueta>}
          </span>
        }
        acciones={<BotonLink href={`/clientes/${c.id}/editar`} variante="secundario">Editar</BotonLink>}
      />
      {aviso === "creado" && <div className="mb-5"><Aviso tono="ok">Cliente dado de alta.</Aviso></div>}
      {aviso === "guardado" && <div className="mb-5"><Aviso tono="ok">Cambios guardados.</Aviso></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {saludo && <a href={saludo} target="_blank" rel="noopener" className={clasesBoton("primario")}>WhatsApp</a>}
            {(c.telefono || c.whatsapp) && <a href={`tel:${c.telefono ?? `+${c.whatsapp}`}`} className={clasesBoton("secundario")}>Llamar</a>}
            {c.email && <a href={`mailto:${c.email}`} className={clasesBoton("secundario")}>Email</a>}
          </div>
          <Tarjeta className="px-5 py-2">
            <dl>
              {dato("Documento", c.documento && `${c.tipoDoc} ${c.tipoDoc === "CUIT" || c.tipoDoc === "CUIL" ? formatoCuit(c.documento) : c.documento}`)}
              {dato("WhatsApp", c.whatsapp && `+${c.whatsapp}`)}
              {dato("Teléfono", c.telefono)}
              {dato("Email", c.email)}
              {dato("Domicilio", [c.domicilio, c.localidad, c.provincia].filter(Boolean).join(", "))}
              {dato("Cumpleaños", diaMes(c.cumpleanos))}
              {dato("Aniversario", diaMes(c.aniversario))}
              {dato("Talles", c.talles)}
              {dato("Preferencias", c.preferencias)}
              {dato("Cliente desde", fecha(c.creadoEn))}
            </dl>
            {c.notas && <p className="border-t border-linea py-3 text-sm whitespace-pre-line text-tinta-suave">{c.notas}</p>}
          </Tarjeta>

          <Tarjeta className="p-5">
            <h2 className="mb-3 font-medium">Lista de deseos</h2>
            <ul className="mb-4 flex flex-col gap-2">
              {c.deseos.map(({ d, codigo, estadoPieza }) => (
                <li key={d.id} className={`flex items-start justify-between gap-3 text-sm ${d.cumplido ? "text-gris line-through" : ""}`}>
                  <span>
                    {d.productoId ? <Link href={`/stock/${d.productoId}`} className="underline underline-offset-2">{d.descripcion}</Link> : d.descripcion}
                    {codigo && estadoPieza && estadoPieza !== "disponible" && !d.cumplido && <span className="ml-2 text-xs text-alerta">({estadoPieza})</span>}
                    <span className="block text-xs text-gris no-underline">{fecha(d.fecha)}</span>
                  </span>
                  <form action={accionMarcarDeseo}>
                    <input type="hidden" name="deseoId" value={d.id} /><input type="hidden" name="clienteId" value={c.id} /><input type="hidden" name="cumplido" value={d.cumplido ? "0" : "1"} />
                    <button className="min-h-9 rounded px-2 text-xs text-gris hover:text-tinta">{d.cumplido ? "Reabrir" : "Cumplido"}</button>
                  </form>
                </li>
              ))}
              {!c.deseos.length && <li className="text-sm text-gris">Sin deseos anotados.</li>}
            </ul>
            <FormDeseo clienteId={c.id} />
          </Tarjeta>
        </div>

        <div className="flex flex-col gap-5">
          <Tarjeta>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-linea px-5 py-4">
              <div>
                <h2 className="font-medium">Cuenta corriente</h2>
                <p className={`titulo-serif mt-1 text-3xl tabular-nums ${c.saldo > 0 ? "text-error" : ""}`}>{c.saldo === 0 ? "Sin saldo" : c.saldo > 0 ? `Debe ${$(c.saldo)}` : `A favor ${$(c.saldo)}`}</p>
                {c.vencido > 0 && <p className="text-xs text-error">Vencido: {$(c.vencido)}</p>}
                {senas.length > 0 && <p className="mt-1 text-xs text-gris">Incluye señas de operaciones en curso: {senas.map((x) => `${$(x.disponible)} (${textoSena(x.ref)})`).join(", ")}. Se usan al retirar.</p>}
              </div>
              {avisoSaldo && <a href={avisoSaldo} target="_blank" rel="noopener" className={clasesBoton("secundario")}>Recordarle por WhatsApp</a>}
            </div>
            <ul className="divide-y divide-linea">
              {c.cc.map((m) => (
                <li key={m.id} className={`flex items-start justify-between gap-3 px-5 py-3 text-sm ${m.anulado ? "text-gris line-through" : ""}`}>
                  <span>
                    <span className="font-medium">{TIPOS_CC[m.tipo] ?? m.tipo}</span> · {m.descripcion}
                    <span className="block text-xs text-gris no-underline">{fechaHora(m.fecha)}{m.vencimiento ? ` · vence ${fecha(m.vencimiento)}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`whitespace-nowrap tabular-nums ${m.importe > 0 ? "text-error" : "text-ok"}`}>{m.importe > 0 ? "+" : "−"}{$(m.importe)}</span>
                    {admin && !m.anulado && ["saldo_inicial", "ajuste"].includes(m.tipo) && (
                      <form action={accionAnularCc}><input type="hidden" name="movId" value={m.id} /><input type="hidden" name="clienteId" value={c.id} /><button className="text-xs text-gris hover:text-error" aria-label="Anular movimiento">Anular</button></form>
                    )}
                  </span>
                </li>
              ))}
              {!c.cc.length && <li className="px-5 py-6 text-center text-sm text-gris">Sin movimientos. Las ventas en cuenta corriente, las señas y los cobros aparecen acá.</li>}
            </ul>
              <details className="border-t border-linea px-5 py-3">
                <summary className="cursor-pointer text-sm font-medium">{c.saldo > 0 ? "Registrar un pago" : "Registrar un pago a cuenta"}</summary>
                <div className="pt-4"><FormCobroCc clienteId={c.id} saldo={Math.max(0, c.saldo)} medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, moneda: m.moneda, ajustePct: m.ajustePct, planes: m.planes }))} cot={cot} /></div>
              </details>
            {c.saldo < 0 && u.permisos.has("anular_comprobantes") && (
              <details className="border-t border-linea px-5 py-3">
                <summary className="cursor-pointer text-sm font-medium">Devolverle dinero del saldo a favor</summary>
                <div className="pt-4"><FormDevolverSaldo clienteId={c.id} maximo={-c.saldo} cajas={(await listarCajas()).filter((x) => x.moneda === "ARS" && ["efectivo", "banco", "billetera"].includes(x.tipo)).map((x) => ({ id: x.id, nombre: x.nombre }))} /></div>
              </details>
            )}
            {u.permisos.has("ver_tesoreria") && (
              <p className="border-t border-linea px-5 py-3 text-sm"><Link href={`/tesoreria/cheques?cliente=${c.id}`} className="underline underline-offset-4">Recibir un cheque de este cliente</Link></p>
            )}
            {admin && (
              <details className="border-t border-linea px-5 py-3">
                <summary className="cursor-pointer text-sm text-gris hover:text-tinta">Cargar saldo inicial o ajuste</summary>
                <div className="pt-4"><FormCcManual clienteId={c.id} /></div>
              </details>
            )}
          </Tarjeta>
          <Tarjeta>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-5 py-3">
              <h2 className="font-medium">Compras, reparaciones y pedidos</h2>
              <span className="flex gap-3 text-sm">
                <Link href={`/taller/nueva?cliente=${c.id}`} className="underline underline-offset-4">+ Reparación</Link>
                <Link href={`/taller/pedidos/nuevo?cliente=${c.id}`} className="underline underline-offset-4">+ Pedido</Link>
              </span>
            </div>
            <ul className="divide-y divide-linea">
              {historial.slice(0, 40).map((h) => (
                <li key={h.href}>
                  <Link href={h.href} className="flex items-start justify-between gap-3 px-5 py-3 text-sm hover:bg-papel/60">
                    <span>{h.texto}<span className="block text-xs text-gris">{fecha(h.fecha)}</span></span>
                    {h.importe != null && <span className="whitespace-nowrap tabular-nums">{$(h.importe)}</span>}
                  </Link>
                </li>
              ))}
              {!historial.length && <li className="px-5 py-6 text-center text-sm text-gris">Todavía no compró ni dejó trabajos.</li>}
            </ul>
          </Tarjeta>
          {garantias.length > 0 && (
            <Tarjeta>
              <h2 className="border-b border-linea px-5 py-3 font-medium">Garantías vigentes</h2>
              <ul className="divide-y divide-linea">
                {garantias.map((g) => (
                  <li key={g.i.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span>{g.i.descripcion}<span className="block text-xs text-gris">hasta el {fecha(g.hasta)}</span></span>
                    <a href={`/documentos/garantia/${g.v.id}`} target="_blank" className="text-xs underline underline-offset-2">Certificado</a>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
          {admin && (
            <form action={accionEstadoCliente}>
              <input type="hidden" name="clienteId" value={c.id} /><input type="hidden" name="activo" value={c.activo ? "0" : "1"} />
              <button className={clasesBoton(c.activo ? "fantasma" : "secundario")}>{c.activo ? "Desactivar cliente" : "Reactivar cliente"}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

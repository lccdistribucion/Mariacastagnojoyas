import { notFound } from "next/navigation";
import { Aviso, clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { opcionesProveedores } from "@/lib/proveedores/proveedores";
import { contextoPrecios } from "@/lib/stock/consultas";
import { listarAdjuntos } from "@/lib/taller/adjuntos";
import { enlaceAvisoPedido, ESTADOS_PEDIDO, obtenerPedido, PASOS, type EstadoPedido } from "@/lib/taller/pedidos";
import { cotizacionesCobro, senaDisponible } from "@/lib/ventas/cobros";
import { listarMedios } from "@/lib/ventas/medios";
import { GaleriaTaller } from "../../fotos";
import { TONO_PED } from "../../vista";
import { PanelEstadoPedido, PanelMetal, PanelPagoCuenta } from "./paneles";

export const metadata = { title: "Pedido a medida" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;
const g = (mg: number) => `${numero(mg / 1000, 2)} g`;

export default async function FichaPedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  await requiereUsuario();
  const p = await obtenerPedido(Number((await params).id));
  if (!p) notFound();
  const { aviso } = await searchParams;
  const [fotos, talleres, sena, wa, ctx, medios, cot] = await Promise.all([listarAdjuntos("pedido", p.id), opcionesProveedores(["taller", "artesano", "fabricante"]), senaDisponible(`pedido:${p.id}`), enlaceAvisoPedido(p.id), contextoPrecios(), listarMedios(), cotizacionesCobro()]);
  const abierto = !["entregado", "cancelado"].includes(p.estado);
  // Misma cuenta que hace el mostrador al cobrar.
  const gramo = p.leyId ? ctx.gramo.get(p.leyId) : null;
  const peso = p.pesoFinalMg ?? p.gramosEstimadosMg;
  const precioHoy = p.modoPrecio === "congelado" ? p.presupuesto : gramo != null && peso ? Math.round((peso / 1000) * gramo + p.hechura / 100) * 100 : null;
  const dato = (t: string, v: React.ReactNode) => (v ? <div className="flex justify-between gap-4 border-b border-linea py-2 text-sm last:border-0"><dt className="text-gris">{t}</dt><dd className="text-right">{v}</dd></div> : null);
  return (
    <>
      <Encabezado
        titulo={`Pedido N.º ${p.numero}`}
        bajada={<span className="flex flex-wrap items-center gap-2">{p.cliente.nombre} <Etiqueta tono={TONO_PED[p.estado]}>{ESTADOS_PEDIDO[p.estado as EstadoPedido]}</Etiqueta></span>}
        acciones={<a href={`/documentos/pedido/${p.id}`} target="_blank" className={clasesBoton("secundario")}>Orden de pedido (PDF)</a>}
      />
      {aviso === "creado" && <div className="mb-5"><Aviso tono="ok">Pedido registrado. Imprimí la orden para que la firme el cliente.</Aviso></div>}
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <Tarjeta className="px-5 py-2">
            <dl>
              {dato("Pedido", p.descripcion)}
              {dato("Metal", p.ley)}
              {dato("Piedras", p.piedras)}
              {dato("Talle", p.talle)}
              {dato("Fecha", fecha(p.fecha))}
              {dato("Entrega estimada", p.entregaEstimada && fecha(p.entregaEstimada))}
              {dato("Precio", p.modoPrecio === "congelado" ? `${$(p.presupuesto)} (pactado)` : `Gramos × valor del día + hechura ${$(p.hechura)}`)}
              {dato(p.modoPrecio === "congelado" ? "A cobrar" : `Hoy saldría (${peso ? g(peso) : "sin gramos"})`, precioHoy != null ? $(precioHoy) : "Sin cotización")}
              {dato("Pagado a cuenta", sena > 0 && $(sena))}
              {dato("Taller", p.taller)}
              {dato("Costo del taller", p.costoTaller != null && $(p.costoTaller))}
              {dato("Notas", p.notas)}
            </dl>
          </Tarjeta>
          {p.leyId && (
            <Tarjeta className="p-5">
              <h2 className="mb-3 font-medium">Metal con el taller</h2>
              <dl className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-gris">Entregado</dt><dd className="tabular-nums">{g(p.metalEntregadoMg)}</dd></div>
                <div><dt className="text-xs text-gris">Devuelto</dt><dd className="tabular-nums">{g(p.metalDevueltoMg)}</dd></div>
                <div><dt className="text-xs text-gris">Peso final</dt><dd className="tabular-nums">{p.pesoFinalMg != null ? g(p.pesoFinalMg) : "—"}</dd></div>
                <div><dt className="text-xs text-gris">Merma</dt><dd className={`tabular-nums ${p.merma != null && p.merma > 0 ? "text-alerta" : ""}`}>{p.merma != null ? g(p.merma) : "—"}</dd></div>
              </dl>
              {abierto && <PanelMetal id={p.id} />}
            </Tarjeta>
          )}
          <Tarjeta className="p-5">
            <h2 className="mb-3 font-medium">Fotos y referencias</h2>
            <GaleriaTaller entidad="pedido" id={p.id} fotos={fotos.map((f) => f.archivo)} />
          </Tarjeta>
          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-3 font-medium">Historial</h2>
            <ul className="divide-y divide-linea">
              {p.historial.map((h) => (
                <li key={h.id} className="px-5 py-2.5 text-sm">
                  <span className="font-medium">{ESTADOS_PEDIDO[h.estado as EstadoPedido] ?? h.estado}</span>
                  {h.nota ? ` · ${h.nota}` : ""}
                  <span className="block text-xs text-gris">{fechaHora(h.fecha)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
        <div className="flex flex-col gap-5">
          {p.estado === "listo" && <a href={`/mostrador?servicio=pedido:${p.id}`} className={clasesBoton("primario", "w-full text-base")}>Cobrar y entregar</a>}
          {p.estado === "listo" && (wa ? <a href={wa} target="_blank" rel="noopener" className={clasesBoton("secundario", "w-full")}>Avisar por WhatsApp que está listo</a> : <p className="text-sm text-gris">El cliente no tiene WhatsApp cargado.</p>)}
          {abierto && (
            <Tarjeta className="p-5">
              <h2 className="mb-3 font-medium">Cambiar estado</h2>
              <PanelEstadoPedido id={p.id} pasos={PASOS[p.estado].map((k) => ({ k, t: ESTADOS_PEDIDO[k] }))} talleres={talleres} tallerActual={p.proveedorId} conMetal={!!p.leyId} />
            </Tarjeta>
          )}
          {abierto && (
            <Tarjeta className="p-5">
              <h2 className="mb-3 font-medium">Pago a cuenta</h2>
              <PanelPagoCuenta id={p.id} medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, moneda: m.moneda, ajustePct: m.ajustePct, planes: m.planes }))} cot={cot} />
            </Tarjeta>
          )}
          {p.estado === "entregado" && p.ventaId && <a href={`/ventas/${p.ventaId}`} className={clasesBoton("secundario")}>Ver la venta de la entrega</a>}
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { deMicro } from "@/lib/cotizaciones/tipos";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { MEDIOS_PAGO, obtenerCompra, TIPOS_COMPROBANTE } from "@/lib/proveedores/compras";
import { importe } from "@/lib/proveedores/vista";
import { AnularCompra } from "./anular";

export const metadata = { title: "Compra" };

export default async function DetalleCompra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const u = await requiereUsuario();
  const c = await obtenerCompra(Number((await params).id));
  if (!c) notFound();
  const { aviso } = await searchParams;
  const $ = (x: number) => importe(x, c.moneda);
  return (
    <>
      <Encabezado
        titulo={`${TIPOS_COMPROBANTE[c.tipoComprobante as keyof typeof TIPOS_COMPROBANTE]}${c.numero != null ? ` ${String(c.puntoVenta ?? 0).padStart(5, "0")}-${String(c.numero).padStart(8, "0")}` : ""}`}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/proveedores/${c.proveedorId}`} className="underline underline-offset-2">{c.proveedor}</Link> · {fecha(c.fecha)}
            {c.anulada ? <Etiqueta tono="error">Anulada</Etiqueta> : c.pendiente > 0 ? <Etiqueta tono="alerta">Falta pagar {$(c.pendiente)}</Etiqueta> : <Etiqueta tono="ok">Pagada</Etiqueta>}
          </span>
        }
      />
      {aviso === "cargada" && <div className="mb-5"><Aviso tono="ok">Compra registrada: el stock, los costos{c.items.some((i) => i.tipo === "metal") ? ", el metal" : ""} y la cuenta corriente ya están actualizados.</Aviso></div>}
      {c.anulada && <div className="mb-5"><Aviso tono="error">Anulada: {c.motivoAnulacion}</Aviso></div>}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Tarjeta>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-gris"><tr><th className="px-5 py-3 font-normal">Ítem</th><th className="px-3 py-3 text-right font-normal">Cant. / g</th><th className="px-3 py-3 text-right font-normal">Unitario</th><th className="px-5 py-3 text-right font-normal">Subtotal</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {c.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3">
                      {i.productoId ? <Link href={`/stock/${i.productoId}`} className="hover:underline">{i.descripcion}</Link> : i.descripcion}
                      {i.productoNuevo && <span className="ml-2 text-xs text-champagne">alta nueva</span>}
                      {i.tipo === "metal" && <span className="ml-2 text-xs text-champagne">metal propio</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{i.tipo === "metal" ? `${numero((i.pesoMg ?? 0) / 1000, 2)} g` : i.cantidad}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{$(i.costoUnitario)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{$(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="flex flex-col items-end gap-1 border-t border-linea px-5 py-4 text-sm tabular-nums">
            <div className="flex gap-6"><dt className="text-gris">Neto</dt><dd>{$(c.neto)}</dd></div>
            {c.iva > 0 && <div className="flex gap-6"><dt className="text-gris">IVA</dt><dd>{$(c.iva)}</dd></div>}
            {c.percepcionIva > 0 && <div className="flex gap-6"><dt className="text-gris">Percepción IVA</dt><dd>{$(c.percepcionIva)}</dd></div>}
            {c.percepcionIibb > 0 && <div className="flex gap-6"><dt className="text-gris">Percepción IIBB</dt><dd>{$(c.percepcionIibb)}</dd></div>}
            {c.otrosImpuestos > 0 && <div className="flex gap-6"><dt className="text-gris">Otros</dt><dd>{$(c.otrosImpuestos)}</dd></div>}
            <div className="flex items-baseline gap-6"><dt className="text-gris">Total</dt><dd className="titulo-serif text-3xl">{$(c.total)}</dd></div>
            {c.moneda !== "ARS" && <div className="text-xs text-gris">Tipo de cambio {numero(deMicro(c.tipoCambio), 2)} · ≈ $ {numero((c.total / 100) * deMicro(c.tipoCambio), 0)}</div>}
          </dl>
        </Tarjeta>
        <div className="flex flex-col gap-5">
          <Tarjeta className="p-5 text-sm">
            <h2 className="mb-2 font-medium">Pagos</h2>
            {c.pagos.length === 0 ? <p className="text-gris">Sin pagos todavía.{c.vencimiento && ` Vence el ${fecha(c.vencimiento)}.`}</p> : (
              <ul className="flex flex-col gap-1">
                {c.pagos.map(({ i, p }) => <li key={i.id} className={p.anulado ? "text-gris line-through" : ""}>{fecha(p.fecha)} · {MEDIOS_PAGO[p.medio as keyof typeof MEDIOS_PAGO]} · {$(i.importe)}</li>)}
              </ul>
            )}
            {c.notas && <p className="mt-3 text-tinta-suave">{c.notas}</p>}
            <p className="mt-3 text-xs text-gris">Cargada el {fechaHora(c.creadaEn)}.</p>
          </Tarjeta>
          {!c.anulada && u.permisos.has("anular_comprobantes") && <Tarjeta className="p-5"><AnularCompra compraId={c.id} /></Tarjeta>}
        </div>
      </div>
    </>
  );
}

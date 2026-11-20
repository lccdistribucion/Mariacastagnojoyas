import { Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, numero } from "@/lib/formato";
import { listarVales } from "@/lib/ventas/vales";
import { ConsultaVale } from "./consulta";

export const metadata = { title: "Gift cards y vales" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

export default async function Vales() {
  await requiereUsuario();
  const filas = await listarVales();
  const ahora = Date.now();
  return (
    <>
      <Encabezado titulo="Gift cards y vales" bajada="Las gift cards se venden en el mostrador; los vales de cambio salen de las devoluciones. Se usan como medio de pago con su código." />
      <div className="mb-5"><ConsultaVale /></div>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>Todavía no hay gift cards ni vales.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-mono text-sm font-medium">
                    {v.codigo}
                    <Etiqueta tono={v.tipo === "gift_card" ? "champagne" : "neutro"}>{v.tipo === "gift_card" ? "Gift card" : "Vale de cambio"}</Etiqueta>
                    {v.saldo === 0 && <Etiqueta>Usado</Etiqueta>}
                    {v.vence && v.vence.getTime() < ahora && v.saldo > 0 && <Etiqueta tono="alerta">Vencido</Etiqueta>}
                  </span>
                  <span className="block text-xs text-gris">Emitido el {fecha(v.creadoEn)}{v.vence ? ` · vence el ${fecha(v.vence)}` : ""}</span>
                </span>
                <span className="text-right text-sm tabular-nums">
                  {$(v.saldo)}
                  {v.saldo !== v.monto && <span className="block text-xs text-gris">de {$(v.monto)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

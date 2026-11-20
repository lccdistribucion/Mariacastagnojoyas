import { Aviso, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { fecha, numero } from "@/lib/formato";
import { listarAcreditaciones } from "@/lib/tesoreria/acreditaciones";
import { listarCajas } from "@/lib/tesoreria/cajas";
import { PanelAcreditar } from "./panel";

export const metadata = { title: "Tarjetas a acreditar" };
const $ = (c: number) => `$ ${numero(c / 100, 2)}`;

export default async function Tarjetas({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const [pend, hechas, cajas] = await Promise.all([listarAcreditaciones("pendiente"), listarAcreditaciones("acreditada"), listarCajas()]);
  const bancos = cajas.filter((c) => c.tipo === "banco" && c.moneda === "ARS");
  const tarjetas = cajas.filter((c) => c.tipo === "tarjetas");
  const ahora = Date.now();
  return (
    <>
      <Encabezado titulo="Tarjetas a acreditar" bajada="Cobros con débito y crédito que la procesadora todavía no depositó. Cuando llega la liquidación, marcá los cupones, cargá el neto y las retenciones: la comisión se calcula sola." />
      {aviso === "acreditado" && <div className="mb-5"><Aviso tono="ok">Acreditación registrada: el neto pasó al banco y la comisión y las retenciones quedaron como gastos.</Aviso></div>}
      <PanelAcreditar
        bancos={bancos.map((b) => ({ id: b.id, nombre: b.nombre }))}
        bancoDefecto={tarjetas[0]?.bancoId ?? bancos[0]?.id ?? null}
        cupones={pend.map(({ a, cliente, medio, ventaId, caja }) => ({ id: a.id, bruto: a.bruto, texto: `${fecha(a.fecha)} · ${medio}${a.cuotas && a.cuotas > 1 ? ` ${a.cuotas} cuotas` : ""}${cliente ? ` · ${cliente}` : ""}${ventaId ? "" : " · seña/cobro"}${tarjetas.length > 1 ? ` · ${caja}` : ""}`, esperada: fecha(a.fechaEsperada), atrasada: a.fechaEsperada.getTime() < ahora - 86400_000, cajaId: a.cajaId }))}
      />
      <Tarjeta className="mt-6">
        <h2 className="border-b border-linea px-5 py-3 font-medium">Acreditadas (últimas)</h2>
        {!hechas.length ? (
          <Vacio>Todavía no se acreditó ninguna.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {hechas.slice(-50).reverse().map(({ a, medio, cliente }) => {
              const demora = a.fechaReal ? Math.round((a.fechaReal.getTime() - a.fechaEsperada.getTime()) / 86400_000) : 0;
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    {fecha(a.fecha)} · {medio}{cliente ? ` · ${cliente}` : ""}
                    <span className="flex flex-wrap items-center gap-2 text-xs text-gris">
                      Esperada {fecha(a.fechaEsperada)} · real {a.fechaReal ? fecha(a.fechaReal) : "—"}
                      {demora > 0 && <Etiqueta tono="alerta">{demora} día/s tarde</Etiqueta>}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    {$(a.bruto)}
                    <span className="block text-xs text-gris">neto {$(a.neto ?? 0)} · comisión {$(a.comision ?? 0)} · ret. {$(a.retencion ?? 0)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

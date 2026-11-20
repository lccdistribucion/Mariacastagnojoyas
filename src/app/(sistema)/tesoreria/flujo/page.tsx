import Link from "next/link";
import { Encabezado, Tarjeta } from "@/components/ui";
import { fecha, numero } from "@/lib/formato";
import { flujoDeFondos, type Partida } from "@/lib/tesoreria/flujo";

export const metadata = { title: "Flujo de fondos" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;
const TIPOS: Record<Partida["tipo"], string> = { tarjeta: "Tarjetas", cheque_tercero: "Cheques a cobrar", cliente: "Clientes", proveedor: "Proveedores", cheque_propio: "Cheques propios" };

function Detalle({ partidas }: { partidas: Partida[] }) {
  if (!partidas.length) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-gris">Ver detalle ({partidas.length})</summary>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {partidas.map((p, i) => (
          <li key={i} className="flex justify-between gap-3"><span>{fecha(p.fecha)} · {TIPOS[p.tipo]} · {p.concepto}</span><span className={`whitespace-nowrap tabular-nums ${p.importe < 0 ? "text-error" : "text-ok"}`}>{p.importe < 0 ? "−" : "+"}{$(Math.abs(p.importe))}</span></li>
        ))}
      </ul>
    </details>
  );
}

export default async function Flujo({ searchParams }: { searchParams: Promise<{ por?: string }> }) {
  const porMes = (await searchParams).por === "mes";
  const f = await flujoDeFondos(porMes ? "mes" : "semana");
  const max = Math.max(1, ...f.filas.map((x) => Math.max(x.entradas, x.salidas)));
  return (
    <>
      <Encabezado
        titulo="Flujo de fondos"
        bajada="Proyección con lo que ya está registrado: tarjetas a acreditar (neto estimado), cheques, cuotas de clientes y facturas de proveedores. No incluye gastos fijos ni ventas futuras."
        acciones={
          <div className="flex gap-2">
            <Link href="/tesoreria/flujo" className={`flex min-h-10 items-center rounded-full border px-4 text-sm ${!porMes ? "border-tinta bg-tinta text-white" : "border-linea-fuerte"}`}>Por semana</Link>
            <Link href="/tesoreria/flujo?por=mes" className={`flex min-h-10 items-center rounded-full border px-4 text-sm ${porMes ? "border-tinta bg-tinta text-white" : "border-linea-fuerte"}`}>Por mes</Link>
          </div>
        }
      />
      <Tarjeta>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-linea px-5 py-3 text-sm">
          <span className="text-gris">Disponible hoy</span>
          <span className="text-right font-medium tabular-nums">{$(f.disponible)}</span>
        </div>
        {(f.vencido.entradas > 0 || f.vencido.salidas > 0) && (
          <div className="border-b border-linea bg-alerta-suave/40 px-5 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-3"><span className="font-medium">Vencido sin cobrar / sin pagar</span><span className="tabular-nums"><span className="text-ok">+{$(f.vencido.entradas)}</span> · <span className="text-error">−{$(f.vencido.salidas)}</span></span></div>
            <Detalle partidas={f.vencido.partidas} />
          </div>
        )}
        <ul className="divide-y divide-linea">
          {f.filas.map((x) => (
            <li key={x.etiqueta} className="px-5 py-3 text-sm">
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr_auto]">
                <span className="font-medium first-letter:uppercase">{x.etiqueta}</span>
                <span className="order-3 col-span-2 flex flex-col gap-1 sm:order-none sm:col-span-1" aria-hidden>
                  <span className="h-2 rounded-full bg-ok/70" style={{ width: `${(x.entradas / max) * 100}%` }} />
                  <span className="h-2 rounded-full bg-error/60" style={{ width: `${(x.salidas / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">
                  <span className="text-ok">+{$(x.entradas)}</span> · <span className="text-error">−{$(x.salidas)}</span>
                  <span className={`block text-xs ${x.saldo < 0 ? "font-medium text-error" : "text-gris"}`}>Saldo {$(x.saldo)}</span>
                </span>
              </div>
              <Detalle partidas={x.partidas} />
            </li>
          ))}
        </ul>
        {f.despues.partidas.length > 0 && <p className="border-t border-linea px-5 py-3 text-xs text-gris">Más adelante: +{$(f.despues.entradas)} · −{$(f.despues.salidas)} ({f.despues.partidas.length} partida/s).</p>}
      </Tarjeta>
    </>
  );
}

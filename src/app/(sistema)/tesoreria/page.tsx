import Link from "next/link";
import { Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { IconoFlecha } from "@/components/iconos";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { saldoMetal } from "@/lib/stock/metal";
import { listarAcreditaciones } from "@/lib/tesoreria/acreditaciones";
import { estadoDelDia } from "@/lib/tesoreria/arqueos";
import { formatoMoneda, listarCajas, listarCategorias, listarMovimientos, TIPOS_CAJA, type TipoCaja } from "@/lib/tesoreria/cajas";
import { chequesProximos } from "@/lib/tesoreria/cheques";
import { Operaciones } from "./operaciones";

export const metadata = { title: "Tesorería" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

export default async function Tesoreria({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  const { op } = await searchParams;
  const [cajas, cats, ultimos, pend, proximos, dia, metal] = await Promise.all([listarCajas(), listarCategorias(), listarMovimientos({ limite: 8 }), listarAcreditaciones("pendiente"), chequesProximos(new Date(Date.now() + 7 * 86400_000)), estadoDelDia(), saldoMetal()]);
  const disponible = cajas.filter((c) => ["efectivo", "banco", "billetera"].includes(c.tipo)).reduce((s, c) => s + (c.enPesos ?? 0), 0);
  const total = cajas.reduce((s, c) => s + (c.enPesos ?? 0), 0);
  const ahora = Date.now();
  const atrasadas = pend.filter((p) => p.a.fechaEsperada.getTime() < ahora - 86400_000).length;
  const valorMetal = metal.reduce((s, m) => s + (m.valorMercado ?? 0), 0);
  return (
    <>
      <Encabezado titulo="Tesorería" bajada={`Disponible hoy (efectivo, bancos y billeteras): ${$(disponible)} · Con tarjetas y cheques: ${$(total)}. Las divisas se pasan a pesos a la cotización de compra de hoy.`} />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cajas">
        {cajas.map((c) => (
          <Link key={c.id} href={`/tesoreria/movimientos?caja=${c.id}`}>
            <Tarjeta className="h-full p-4 transition-colors hover:border-linea-fuerte sm:p-5">
              <p className="flex items-center justify-between gap-2 text-xs text-gris"><span>{c.nombre}</span><span>{TIPOS_CAJA[c.tipo as TipoCaja]}</span></p>
              <p className={`titulo-serif mt-2 text-3xl tabular-nums ${c.saldo < 0 ? "text-error" : ""}`}>{formatoMoneda(c.saldo, c.moneda)}</p>
              {c.moneda !== "ARS" && <p className="text-xs text-gris tabular-nums">≈ {c.enPesos != null ? $(c.enPesos) : "sin cotización"}</p>}
            </Tarjeta>
          </Link>
        ))}
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Tarjeta className="p-5">
          <h2 className="mb-4 font-medium">Registrar</h2>
          <Operaciones cajas={cajas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda, tipo: c.tipo }))} categorias={cats.filter((c) => c.activa)} inicial={op === "transferencia" || op === "divisas" || op === "ingreso" ? op : "gasto"} />
        </Tarjeta>
        <div className="flex flex-col gap-5">
          <Tarjeta className="p-5">
            <h2 className="mb-3 font-medium">Para tener en cuenta</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex justify-between gap-3"><Link href="/caja" className="underline-offset-2 hover:underline">Caja del día</Link><span>{dia.length ? dia.map((d) => (d.arqueo?.cierreEn ? "cerrada" : d.arqueo?.aperturaEn ? "abierta" : "sin abrir")).filter((v, i, a) => a.indexOf(v) === i).join(" / ") : "—"}</span></li>
              <li className="flex justify-between gap-3"><Link href="/tesoreria/tarjetas" className="underline-offset-2 hover:underline">Tarjetas a acreditar</Link><span className="tabular-nums">{pend.length} cupón/es · {$(pend.reduce((s, p) => s + p.a.bruto, 0))}{atrasadas ? <Etiqueta tono="alerta">{atrasadas} atrasada/s</Etiqueta> : null}</span></li>
              <li className="flex justify-between gap-3"><Link href="/tesoreria/cheques" className="underline-offset-2 hover:underline">Cheques próximos 7 días</Link><span>{proximos.length ? proximos.map((c) => `${c.tipo === "tercero" ? "cobrar" : "pagar"} ${$(c.importe)} el ${fecha(c.fechaPago)}`).join(" · ") : "ninguno"}</span></li>
              <li className="flex justify-between gap-3"><Link href="/stock/metal" className="underline-offset-2 hover:underline">Metal propio</Link><span className="tabular-nums">{metal.map((m) => `${numero(m.gramos, 2)} g ${m.ley}`).join(" · ") || "sin metal"}{valorMetal ? ` (≈ ${$(valorMetal)})` : ""}</span></li>
            </ul>
          </Tarjeta>
          <Tarjeta>
            <div className="flex items-center justify-between border-b border-linea px-5 py-3">
              <h2 className="font-medium">Últimos movimientos</h2>
              <Link href="/tesoreria/movimientos" className="flex items-center gap-1 text-sm text-gris hover:text-tinta">Ver todo <IconoFlecha className="size-4" /></Link>
            </div>
            <ul className="divide-y divide-linea">
              {ultimos.map(({ m, caja, moneda }) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">{m.descripcion}<span className="block text-xs text-gris">{caja} · {fechaHora(m.fecha)}</span></span>
                  <span className={`whitespace-nowrap tabular-nums ${m.importe < 0 ? "text-error" : "text-ok"}`}>{m.importe > 0 ? "+" : "−"}{formatoMoneda(Math.abs(m.importe), moneda)}</span>
                </li>
              ))}
              {!ultimos.length && <li className="px-5 py-6 text-center text-sm text-gris">Todavía no hay movimientos. Cargá el saldo inicial de cada caja en «Cajas y categorías».</li>}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

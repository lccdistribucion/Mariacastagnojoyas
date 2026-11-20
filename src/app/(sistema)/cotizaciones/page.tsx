import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { EstadoCotizacion } from "@/components/estado-cotizacion";
import { GraficoLinea } from "@/components/grafico-linea";
import { IconoExcel, IconoPdf } from "@/components/iconos";
import { db, cotizacionesFijas } from "@/db";
import { requiereUsuario } from "@/lib/auth/sesion";
import { haceDias, serieDiaria, serieGramo } from "@/lib/cotizaciones/historial";
import { todosLosConectores } from "@/lib/cotizaciones/registro";
import { CODIGOS, deMicro, TODOS_LOS_CODIGOS, type Codigo } from "@/lib/cotizaciones/tipos";
import { obtenerVigentes, preciosPorLey, ultimasActualizaciones, type Vigente } from "@/lib/cotizaciones/vigentes";
import { fechaHora, hora, hoyIso, numero } from "@/lib/formato";
import { accionQuitarFija } from "./acciones";
import { BotonActualizar, FormularioManual } from "./controles";

export const metadata = { title: "Cotizaciones" };

const PERIODOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
  { dias: 365, etiqueta: "1 año" },
];
const ars = (v: number | null, dec = 2) => (v == null ? "—" : `$ ${numero(v, dec)}`);
const usd = (v: number | null, dec = 2) => (v == null ? "—" : `US$ ${numero(v, dec)}`);
const cuando = (ms: number | null) => (ms == null ? "—" : hoyIso(new Date(ms)) === hoyIso() ? `hoy ${hora(ms)}` : fechaHora(ms));

export default async function Cotizaciones({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const u = await requiereUsuario();
  const admin = u.permisos.has("modificar_cotizaciones");
  const { periodo } = await searchParams;
  const dias = PERIODOS.find((x) => String(x.dias) === periodo)?.dias ?? 30;
  const desde = haceDias(dias);

  const v = await obtenerVigentes();
  const p = await preciosPorLey(v);
  const ley18 = p.leyes.find((l) => l.metal === "oro" && l.quilates === 18);
  const [sDolar, sEuro, sOro, sGramo, fijas, corridas] = await Promise.all([
    serieDiaria(p.referencia, desde),
    serieDiaria("EUR_OFICIAL", desde),
    serieDiaria("XAU", desde),
    serieGramo(ley18?.milesimos ?? 750, desde),
    db.select().from(cotizacionesFijas),
    admin ? ultimasActualizaciones(10) : Promise.resolve([]),
  ]);
  const conectores = todosLosConectores();

  const filaMoneda = (x: Vigente, ref = false) => (
    <tr key={x.codigo} className={`border-t border-linea ${ref ? "bg-champagne-suave/40" : ""}`}>
      <td className="px-4 py-3 sm:px-5">
        <span className="font-medium">{x.nombre}</span>
        {ref && <span className="ml-2"><Etiqueta tono="champagne">Referencia</Etiqueta></span>}
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{ars(x.compra)}</td>
      <td className="px-3 py-3 text-right font-medium whitespace-nowrap tabular-nums">{ars(x.venta)}</td>
      <td className="hidden px-3 py-3 text-gris md:table-cell">{x.fuenteNombre ?? "—"}</td>
      <td className="hidden px-3 py-3 whitespace-nowrap text-gris sm:table-cell">{cuando(x.fecha)}</td>
      <td className="px-3 py-3 pr-4 sm:pr-5"><EstadoCotizacion estado={x.estado} /></td>
    </tr>
  );

  const monedas: Codigo[] = ["USD_BLUE", "USD_OFICIAL", "USD_MEP", "USD_TARJETA", "USD_CCL", "USD_MAYORISTA", "USD_BCRA", "EUR_OFICIAL", "EUR_BLUE"];

  return (
    <>
      <Encabezado
        titulo="Cotizaciones"
        bajada={
          <>
            Se actualizan solas. El oro se pasa a pesos con el <strong className="font-medium text-tinta">{CODIGOS[p.referencia].nombre.toLowerCase()}</strong>
            {admin && <> (se cambia en <Link href="/configuracion/cotizaciones" className="underline underline-offset-2">Configuración</Link>)</>}.
          </>
        }
        acciones={admin ? <BotonActualizar /> : undefined}
      />

      <div className="grid gap-6 2xl:grid-cols-[1.15fr_1fr]">
        <Tarjeta>
          <h2 className="border-b border-linea px-4 py-4 font-medium sm:px-5">Dólar y euro</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gris">
                <tr>
                  <th className="px-4 py-2 font-normal sm:px-5">Cotización</th>
                  <th className="px-3 py-2 text-right font-normal">Compra</th>
                  <th className="px-3 py-2 text-right font-normal">Venta</th>
                  <th className="hidden px-3 py-2 font-normal md:table-cell">Fuente</th>
                  <th className="hidden px-3 py-2 font-normal sm:table-cell">Actualizada</th>
                  <th className="px-3 py-2 font-normal">Estado</th>
                </tr>
              </thead>
              <tbody>{monedas.map((c) => filaMoneda(v[c], c === p.referencia))}</tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta>
          <div className="border-b border-linea px-4 py-4 sm:px-5">
            <h2 className="font-medium">Metales</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["XAU", "XAG"] as const).map((c) => (
                <div key={c} className="rounded-lg border border-linea px-3 py-2.5">
                  <p className="text-xs text-gris">{c === "XAU" ? "Onza de oro" : "Onza de plata"}</p>
                  <p className="titulo-serif text-2xl tabular-nums">{usd(v[c].venta)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gris">
                    <EstadoCotizacion estado={v[c].estado} />
                    <span>{v[c].fuenteNombre} · {cuando(v[c].fecha)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gris">
                <tr>
                  <th className="px-4 py-2 font-normal sm:px-5">Precio por gramo</th>
                  <th className="px-3 py-2 text-right font-normal">Mercado</th>
                  <th className="px-3 py-2 text-right font-normal">Venta</th>
                  <th className="px-3 py-2 pr-4 text-right font-normal sm:pr-5">Compra usado</th>
                </tr>
              </thead>
              <tbody>
                {p.leyes.map((l) => (
                  <tr key={l.id} className="border-t border-linea">
                    <td className="px-4 py-2.5 sm:px-5">
                      <span className="font-medium whitespace-nowrap">{l.nombre.replace(" (oro bajo)", "")}</span>
                      <span className="block text-xs text-gris">
                        {l.precio?.manual ? "precio manual" : `${l.milesimos} ‰`}
                        {!l.precio?.manual && l.precio?.usd != null && <span className="hidden sm:inline"> · US$ {numero(l.precio.usd, 2)}/g</span>}
                        {l.id === p.leyOroBajo && <span className="text-champagne"> · oro bajo</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{ars(l.precio?.mercado ?? null, 0)}</td>
                    <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{ars(l.precio?.venta ?? null, 0)}</td>
                    <td className="px-3 py-2.5 pr-4 text-right whitespace-nowrap tabular-nums sm:pr-5">{ars(l.precio?.compra ?? null, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-linea px-4 py-3 text-xs text-gris sm:px-5">
            Gramo = onza ÷ 31,1035 × pureza × dólar de referencia. «Venta» y «Compra usado» aplican los ajustes de cada ley{admin ? " (Configuración → Cotizaciones)" : ""}.
          </p>
        </Tarjeta>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="titulo-serif text-2xl">Evolución</h2>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex rounded-lg border border-linea-fuerte bg-superficie p-0.5" aria-label="Período">
              {PERIODOS.map((x) => (
                <Link
                  key={x.dias}
                  href={`/cotizaciones?periodo=${x.dias}`}
                  scroll={false}
                  aria-current={x.dias === dias ? "true" : undefined}
                  className={`flex min-h-10 items-center rounded-md px-3 text-sm ${x.dias === dias ? "bg-tinta text-white" : "text-tinta-suave hover:text-tinta"}`}
                >
                  {x.etiqueta}
                </Link>
              ))}
            </nav>
            <a href={`/cotizaciones/exportar?formato=xlsx&dias=${dias}`} className={clasesBoton("secundario")} aria-label="Exportar historial a Excel"><IconoExcel className="size-4" /> Excel</a>
            <a href={`/cotizaciones/exportar?formato=pdf&dias=${dias}`} className={clasesBoton("secundario")} aria-label="Exportar historial a PDF"><IconoPdf className="size-4" /> PDF</a>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <GraficoLinea titulo={`${CODIGOS[p.referencia].nombre} (venta)`} serie={sDolar} formato="ars" decimales={0} />
          <GraficoLinea titulo="Euro oficial (venta)" serie={sEuro} formato="ars" decimales={0} nota="Días anteriores: referencia diaria del BCRA." />
          <GraficoLinea titulo="Onza de oro (USD)" serie={sOro} formato="usd" decimales={0} nota="Valor diario. Antes de hoy, del BCRA (cierre de cada día hábil)." />
          <GraficoLinea titulo={`${ley18?.nombre ?? "Oro 18k"}, gramo en pesos`} serie={sGramo} formato="ars" decimales={0} nota="Calculado con la onza y el dólar de referencia de cada día." />
        </div>
      </section>

      {admin && (
        <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Tarjeta className="p-5 sm:p-6">
            <h2 className="font-medium">Cargar una cotización a mano</h2>
            <p className="mt-1 mb-5 text-sm text-gris">Para cuando falla la automática, o para fijar una cotización propia del negocio.</p>
            <FormularioManual opciones={TODOS_LOS_CODIGOS.map((c) => ({ codigo: c, nombre: CODIGOS[c].nombre }))} />
            {fijas.length > 0 && (
              <div className="mt-6 border-t border-linea pt-5">
                <h3 className="text-sm font-medium">Cotizaciones propias vigentes</h3>
                <ul className="mt-3 divide-y divide-linea rounded-lg border border-linea">
                  {fijas.map((f) => (
                    <li key={f.codigo} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm">
                        <span className="font-medium">{CODIGOS[f.codigo as Codigo]?.nombre ?? f.codigo}</span>
                        <span className="block text-xs text-gris">Compra {numero(deMicro(f.compra))} · Venta {numero(deMicro(f.venta))} · desde {fechaHora(f.desde)}{f.nota ? ` · ${f.nota}` : ""}</span>
                      </span>
                      <form action={accionQuitarFija}>
                        <input type="hidden" name="codigo" value={f.codigo} />
                        <button className={clasesBoton("secundario")}>Quitar (volver a la automática)</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Tarjeta>

          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-4 font-medium">Últimas actualizaciones</h2>
            <ul className="divide-y divide-linea">
              {corridas.map((c) => {
                const fuentes = JSON.parse(c.detalle) as { id: string; nombre: string; ok: boolean; error?: string }[];
                return (
                  <li key={c.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{fechaHora(c.fecha)} <span className="text-gris">· {c.origen === "manual" ? "a pedido" : "automática"}</span></span>
                      <span className="flex gap-1.5">
                        <Etiqueta tono="ok">{c.actualizadas} ok</Etiqueta>
                        {c.conRespaldo > 0 && <Etiqueta tono="alerta">{c.conRespaldo} respaldo</Etiqueta>}
                        {c.fallidas > 0 && <Etiqueta tono="error">{c.fallidas} sin dato</Etiqueta>}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gris">
                      {fuentes.map((f) => `${conectores.find((x) => x.id === f.id)?.nombre ?? f.nombre} ${f.ok ? "✓" : `✗ (${f.error})`}`).join(" · ")}
                    </p>
                  </li>
                );
              })}
              {corridas.length === 0 && <li className="px-5 py-8 text-center text-sm text-gris">Todavía no hubo actualizaciones.</li>}
            </ul>
          </Tarjeta>
        </section>
      )}
    </>
  );
}

import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { hora, hoyIso } from "@/lib/formato";
import { historialArqueos } from "@/lib/tesoreria/arqueos";
import { formatoMoneda } from "@/lib/tesoreria/cajas";

export const metadata = { title: "Arqueos" };

export default async function Arqueos() {
  const filas = await historialArqueos(hoyIso(new Date(Date.now() - 60 * 86400_000)));
  const dif = (esp: number | null, cont: number | null) => (esp == null || cont == null ? null : cont - esp);
  return (
    <>
      <Encabezado titulo="Arqueos" bajada="Aperturas y cierres de las cajas de efectivo de los últimos 60 días, con lo esperado, lo contado y las diferencias." acciones={<Link href="/caja" className={clasesBoton("primario")}>Caja del día</Link>} />
      <Tarjeta>
        {!filas.length ? (
          <Vacio>Todavía no se abrió ni cerró ninguna caja.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ a, caja, moneda, abrio }) => {
              const dA = dif(a.esperadoApertura, a.contadoApertura);
              const dC = dif(a.esperadoCierre, a.contadoCierre);
              const $ = (c: number) => formatoMoneda(c, moneda);
              return (
                <li key={a.id} className="flex flex-col gap-1 px-5 py-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium">{a.dia.split("-").reverse().join("/")} · {caja}{!a.cierreEn && a.dia < hoyIso() && <Etiqueta tono="alerta">Quedó sin cerrar</Etiqueta>}</span>
                  <span className="text-xs text-gris">
                    {a.aperturaEn ? `Apertura ${hora(a.aperturaEn)} (${abrio ?? "—"}): contado ${$(a.contadoApertura!)}` : "Sin apertura"}
                    {dA ? <span className={dA < 0 ? "text-error" : "text-ok"}> · {dA < 0 ? "faltante" : "sobrante"} {$(Math.abs(dA))}</span> : null}
                    {" · "}
                    {a.cierreEn ? `Cierre ${hora(a.cierreEn)}: contado ${$(a.contadoCierre!)}` : "sin cierre"}
                    {dC ? <span className={dC < 0 ? "text-error" : "text-ok"}> · {dC < 0 ? "faltante" : "sobrante"} {$(Math.abs(dC))}</span> : null}
                  </span>
                  {a.notas && <span className="text-xs">{a.notas}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

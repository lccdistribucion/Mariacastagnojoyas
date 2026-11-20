import Link from "next/link";
import { Aviso, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fechaHora, hora, hoyIso, inicioDelDia } from "@/lib/formato";
import { estadoDelDia } from "@/lib/tesoreria/arqueos";
import { formatoMoneda, listarMovimientos } from "@/lib/tesoreria/cajas";
import { FormArqueo } from "./panel";

export const metadata = { title: "Caja del día" };

export default async function CajaDelDia() {
  const u = await requiereUsuario();
  const admin = u.permisos.has("ver_tesoreria");
  const estado = await estadoDelDia();
  const hoy = hoyIso();
  const movs = admin ? await listarMovimientos({ desde: inicioDelDia(hoy), limite: 200 }) : [];
  return (
    <>
      <Encabezado
        titulo="Caja del día"
        bajada={`Al abrir y al cerrar el local, contá el efectivo de cada caja y anotalo. ${admin ? "El sistema lo compara con lo que tendría que haber." : "Si hay diferencia, queda registrada y le llega un aviso al administrador."}`}
        acciones={admin ? <Link href="/tesoreria/arqueos" className="text-sm underline underline-offset-4">Historial de arqueos</Link> : undefined}
      />
      {!estado.length && <Tarjeta><Vacio>No hay cajas de efectivo con apertura y cierre (Tesorería → Cajas).</Vacio></Tarjeta>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {estado.map(({ caja, esperado, arqueo }) => {
          const momento = !arqueo?.aperturaEn && !arqueo?.cierreEn ? "apertura" : !arqueo?.cierreEn ? "cierre" : null;
          return (
            <Tarjeta key={caja.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{caja.nombre}</h2>
                <Etiqueta tono={arqueo?.cierreEn ? "neutro" : arqueo?.aperturaEn ? "ok" : "alerta"}>{arqueo?.cierreEn ? "Cerrada" : arqueo?.aperturaEn ? "Abierta" : "Sin abrir"}</Etiqueta>
              </div>
              {admin && <p className="text-sm text-gris">Tendría que haber: <strong className="text-tinta tabular-nums">{formatoMoneda(esperado, caja.moneda)}</strong></p>}
              {arqueo?.aperturaEn && <p className="text-xs text-gris">Abrió a las {hora(arqueo.aperturaEn)} con {formatoMoneda(arqueo.contadoApertura ?? 0, caja.moneda)}{arqueo.contadoApertura !== arqueo.esperadoApertura ? ` (${(arqueo.contadoApertura ?? 0) > (arqueo.esperadoApertura ?? 0) ? "sobraban" : "faltaban"} ${formatoMoneda(Math.abs((arqueo.contadoApertura ?? 0) - (arqueo.esperadoApertura ?? 0)), caja.moneda)}: quedó registrado)` : " (sin diferencia)"}.</p>}
              {arqueo?.cierreEn && <p className="text-xs text-gris">Cerró a las {hora(arqueo.cierreEn)} con {formatoMoneda(arqueo.contadoCierre ?? 0, caja.moneda)}{arqueo.contadoCierre !== arqueo.esperadoCierre ? ` (${(arqueo.contadoCierre ?? 0) > (arqueo.esperadoCierre ?? 0) ? "sobraban" : "faltaban"} ${formatoMoneda(Math.abs((arqueo.contadoCierre ?? 0) - (arqueo.esperadoCierre ?? 0)), caja.moneda)}: quedó registrado)` : " (sin diferencia)"}.</p>}
              {momento ? <FormArqueo key={momento} cajaId={caja.id} momento={momento} moneda={caja.moneda} /> : <Aviso tono="ok">Listo por hoy.</Aviso>}
            </Tarjeta>
          );
        })}
      </div>
      {admin && (
        <Tarjeta className="mt-6">
          <h2 className="border-b border-linea px-5 py-3 font-medium">Movimientos de hoy</h2>
          {!movs.length ? (
            <Vacio>Todavía no hubo movimientos hoy.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {movs.map(({ m, caja, moneda }) => (
                <li key={m.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>{m.descripcion}<span className="block text-xs text-gris">{caja} · {fechaHora(m.fecha)}</span></span>
                  <span className={`whitespace-nowrap tabular-nums ${m.importe < 0 ? "text-error" : "text-ok"}`}>{m.importe > 0 ? "+" : "−"}{formatoMoneda(Math.abs(m.importe), moneda)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      )}
    </>
  );
}

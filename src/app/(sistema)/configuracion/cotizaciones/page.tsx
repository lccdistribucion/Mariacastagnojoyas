import { Tarjeta } from "@/components/ui";
import { leerConfig } from "@/lib/config";
import { conectoresOrdenados, todosLosConectores } from "@/lib/cotizaciones/registro";
import { CODIGOS, DOLARES_REFERENCIA } from "@/lib/cotizaciones/tipos";
import { listarLeyes, obtenerVigentes } from "@/lib/cotizaciones/vigentes";
import { numero } from "@/lib/formato";
import { FormFuentes, FormHistorial, FormLey, FormParametros } from "./formularios";

export const metadata = { title: "Configuración de cotizaciones" };

export default async function ConfigCotizaciones() {
  const c = await leerConfig([
    "cotizaciones.dolar_referencia",
    "cotizaciones.frecuencia_minutos",
    "cotizaciones.frecuencia_fuera_horario",
    "cotizaciones.horario_desde",
    "cotizaciones.horario_hasta",
    "cotizaciones.dias",
    "cotizaciones.alerta_variacion_pct",
    "cotizaciones.conectores",
    "cotizaciones.ley_oro_bajo",
    "backup.hora",
    "backup.conservar",
    "backup.carpeta_extra",
  ]);
  const [v, leyes] = await Promise.all([obtenerVigentes(), listarLeyes()]);
  const activos = new Set(conectoresOrdenados(c["cotizaciones.conectores"]).map((x) => x.id));
  const orden = [...c["cotizaciones.conectores"].map((o) => o.id), ...todosLosConectores().map((x) => x.id)].filter((id, i, a) => a.indexOf(id) === i);
  const fuentes = orden
    .map((id) => todosLosConectores().find((x) => x.id === id))
    .filter((x) => !!x)
    .map((x) => ({ id: x.id, nombre: x.nombre, sitio: x.sitio, activo: activos.has(x.id), codigos: x.codigos.map((k) => CODIGOS[k].nombre.replace("Dólar ", "USD ").replace(" — onza troy (USD)", "")), gratis: x.gratis, requiereClave: x.requiereClave, limites: x.limites }));

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-5 sm:p-7">
        <h2 className="mb-5 font-medium">Parámetros</h2>
        <FormParametros
          v={{
            referencia: c["cotizaciones.dolar_referencia"],
            referencias: DOLARES_REFERENCIA.map((k) => ({ codigo: k, nombre: CODIGOS[k].nombre, venta: v[k].venta })),
            frecuencia: c["cotizaciones.frecuencia_minutos"],
            fuera: c["cotizaciones.frecuencia_fuera_horario"],
            desde: c["cotizaciones.horario_desde"],
            hasta: c["cotizaciones.horario_hasta"],
            dias: c["cotizaciones.dias"],
            umbral: c["cotizaciones.alerta_variacion_pct"],
            oroBajo: c["cotizaciones.ley_oro_bajo"],
            leyesOro: leyes.filter((l) => l.metal === "oro" && l.activo).map((l) => ({ id: l.id, nombre: l.nombre })),
            backupHora: c["backup.hora"],
            backupConservar: c["backup.conservar"],
            backupCarpeta: c["backup.carpeta_extra"],
          }}
        />
      </Tarjeta>

      <Tarjeta className="p-5 sm:p-7">
        <h2 className="font-medium">Leyes de metal</h2>
        <p className="mt-1 mb-5 text-sm text-gris">El precio del gramo de cada ley sale de la onza internacional y del dólar de referencia, más el ajuste propio del negocio.</p>
        <ul className="divide-y divide-linea rounded-lg border border-linea">
          {leyes.map((l) => (
            <li key={l.id}>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-papel/60">
                  <span className={`flex-1 font-medium ${l.activo ? "" : "text-gris line-through"}`}>{l.nombre}</span>
                  <span className="text-xs text-gris">
                    {l.precioManualGramo != null ? `manual $ ${numero(l.precioManualGramo / 100)}/g` : `${l.milesimos} ‰`}
                    {" · "}venta {l.ajusteVentaPct >= 0 ? "+" : ""}{numero(l.ajusteVentaPct / 100, 0)} % · compra {l.ajusteCompraPct >= 0 ? "+" : ""}{numero(l.ajusteCompraPct / 100, 0)} %
                  </span>
                  <span className="text-xs text-gris group-open:hidden">Editar ▾</span>
                </summary>
                <div className="border-t border-linea bg-papel/40 px-4 py-5">
                  <FormLey ley={l} />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details className="mt-5">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-linea-fuerte px-4 text-sm">+ Agregar una ley</summary>
          <div className="mt-4 rounded-lg border border-linea p-4"><FormLey /></div>
        </details>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Tarjeta className="p-5 sm:p-7">
          <h2 className="font-medium">Fuentes de cotización</h2>
          <p className="mt-1 mb-5 text-sm text-gris">Todas gratuitas y sin clave. Se pueden ordenar y apagar sin tocar el resto del sistema.</p>
          <FormFuentes fuentes={fuentes} />
        </Tarjeta>
        <Tarjeta className="h-fit p-5 sm:p-7">
          <h2 className="font-medium">Historial</h2>
          <p className="mt-1 mb-5 text-sm text-gris">
            Trae los valores diarios publicados por el BCRA (dólar de referencia, oro y plata) y por ArgentinaDatos (blue, oficial, MEP y tarjeta). Solo agrega los días que faltan.
          </p>
          <FormHistorial />
        </Tarjeta>
      </div>
    </div>
  );
}

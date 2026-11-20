import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { listarAlertas } from "@/lib/alertas";
import { requierePermiso } from "@/lib/auth/sesion";
import { fechaHora } from "@/lib/formato";
import { marcarTodas } from "./acciones";

export const metadata = { title: "Avisos" };

const TONO = { info: "neutro", alerta: "alerta", error: "error" } as const;
const NIVEL = { info: "Info", alerta: "Atención", error: "Problema" } as const;

export default async function Alertas() {
  await requierePermiso("modificar_cotizaciones");
  const lista = await listarAlertas(200);
  const sinLeer = lista.filter((a) => !a.leidaEn).length;
  return (
    <>
      <Encabezado
        titulo="Avisos"
        bajada="Lo que el sistema detectó solo: fuentes de cotización caídas, variaciones fuertes, copias de seguridad."
        acciones={
          sinLeer > 0 ? (
            <form action={marcarTodas}>
              <button className={clasesBoton("secundario")}>Marcar todo como leído ({sinLeer})</button>
            </form>
          ) : undefined
        }
      />
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>No hay avisos. Todo funciona bien.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {lista.map((a) => (
              <li key={a.id} className={`flex gap-4 px-4 py-4 sm:px-5 ${a.leidaEn ? "opacity-60" : ""}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.leidaEn ? "bg-transparent" : "bg-champagne"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Etiqueta tono={TONO[a.nivel as keyof typeof TONO] ?? "neutro"}>{NIVEL[a.nivel as keyof typeof NIVEL] ?? a.nivel}</Etiqueta>
                    <span className="font-medium">{a.titulo}</span>
                    {!a.leidaEn && <span className="sr-only">(sin leer)</span>}
                  </div>
                  {a.detalle && <p className="mt-1 text-sm text-tinta-suave">{a.detalle}</p>}
                  <p className="mt-1 text-xs text-gris">{fechaHora(a.fecha)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

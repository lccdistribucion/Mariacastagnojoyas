import { clasesBoton, Tarjeta } from "@/components/ui";
import { IconoDescarga } from "@/components/iconos";
import { requierePermiso } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { FormularioConfig } from "./formulario";

export const metadata = { title: "Configuración" };

export default async function Configuracion() {
  await requierePermiso("configurar_sistema");
  const c = await leerConfig([
    "negocio.nombre",
    "seguridad.intentos_max",
    "seguridad.bloqueo_minutos",
    "seguridad.inactividad_minutos",
    "seguridad.sesion_horas",
    "ventas.descuento_max_pct",
  ]);
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Tarjeta className="p-5 sm:p-7">
          <FormularioConfig
            v={{
              nombre: c["negocio.nombre"],
              intentos: c["seguridad.intentos_max"],
              bloqueo: c["seguridad.bloqueo_minutos"],
              inactividad: c["seguridad.inactividad_minutos"],
              horas: c["seguridad.sesion_horas"],
              descuento: c["ventas.descuento_max_pct"],
            }}
          />
        </Tarjeta>
        <Tarjeta className="h-fit p-5">
          <h2 className="font-medium">Copia de seguridad</h2>
          <p className="mt-1 text-sm text-gris">Descargá ahora una copia completa de la base de datos. Guardala en un pendrive o en tu Drive. Además, el sistema hace una copia automática todos los días (hora y carpeta en «Cotizaciones y leyes»).</p>
          <form action="/configuracion/copia" method="post" className="mt-4">
            <button className={clasesBoton("secundario", "w-full")}><IconoDescarga className="size-4" /> Descargar copia</button>
          </form>
        </Tarjeta>
      </div>
    </>
  );
}

import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha } from "@/lib/formato";
import { salidasPendientes } from "@/lib/stock/consultas";
import { DESTINOS_SALIDA } from "@/lib/stock/tipos";
import { accionDevolucion } from "../acciones";

export const metadata = { title: "Piezas fuera del local" };

export default async function Salidas() {
  await requiereUsuario();
  const lista = await salidasPendientes();
  const hoy = Date.now();
  return (
    <>
      <Encabezado titulo="Fuera del local" bajada="Piezas en ferias, exhibiciones o a prueba de clientes. Para retirar una, entrá a su ficha → «Retirar del local»." />
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>No hay piezas fuera del local.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {lista.map(({ s, codigo, nombre, productoId }) => {
              const atrasada = s.devolucionEsperada.getTime() < hoy;
              return (
                <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/stock/${productoId}`} className="font-medium hover:underline">{codigo} · {nombre}</Link>
                    <p className="text-sm text-tinta-suave">{DESTINOS_SALIDA[s.destino as keyof typeof DESTINOS_SALIDA]}: {s.detalle}{s.responsable ? ` · responsable ${s.responsable}` : ""}</p>
                    <p className="text-xs text-gris">Salió el {fecha(s.fechaSalida)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Etiqueta tono={atrasada ? "error" : "alerta"}>{atrasada ? "Atrasada" : "Vuelve"} {fecha(s.devolucionEsperada)}</Etiqueta>
                    <form action={accionDevolucion}>
                      <input type="hidden" name="salidaId" value={s.id} />
                      <button className={clasesBoton("primario")}>Volvió</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

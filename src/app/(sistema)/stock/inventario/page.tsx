import Link from "next/link";
import { Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fechaHora } from "@/lib/formato";
import { listarUbicaciones } from "@/lib/stock/catalogos";
import { listarInventarios } from "@/lib/stock/inventario";
import { FormularioNuevaToma } from "./formulario";

export const metadata = { title: "Inventario físico" };

export default async function Inventarios() {
  await requiereUsuario();
  const [lista, ubis] = await Promise.all([listarInventarios(), listarUbicaciones()]);
  return (
    <>
      <Encabezado titulo="Inventario físico" bajada="Escaneá las piezas con el lector, la cámara del celular o tipeando el código, y el sistema te dice qué falta y qué sobra." />
      <Tarjeta className="mb-6 p-4 sm:p-6">
        <h2 className="mb-4 font-medium">Nueva toma de inventario</h2>
        <FormularioNuevaToma ubicaciones={ubis.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))} />
      </Tarjeta>
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>Todavía no se hizo ninguna toma de inventario.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {lista.map((i) => {
              const r = i.resultado ? (JSON.parse(i.resultado) as { faltantes: unknown[]; sobrantes: unknown[]; correctos: number }) : null;
              return (
                <li key={i.id}>
                  <Link href={`/stock/inventario/${i.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-papel/60 sm:px-5">
                    <span>
                      <span className="font-medium">{i.nombre}</span>
                      <span className="block text-xs text-gris">Empezó {fechaHora(i.iniciadoEn)}{i.cerradoEn ? ` · cerró ${fechaHora(i.cerradoEn)}` : ""}</span>
                    </span>
                    {r ? (
                      <span className="flex gap-1.5">
                        <Etiqueta tono="ok">{r.correctos} bien</Etiqueta>
                        {r.faltantes.length > 0 && <Etiqueta tono="error">{r.faltantes.length} faltan</Etiqueta>}
                        {r.sobrantes.length > 0 && <Etiqueta tono="alerta">{r.sobrantes.length} sobran</Etiqueta>}
                      </span>
                    ) : (
                      <Etiqueta tono="champagne">En curso</Etiqueta>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

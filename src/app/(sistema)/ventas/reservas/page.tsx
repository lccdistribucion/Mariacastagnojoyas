import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, numero } from "@/lib/formato";
import { senaDisponible } from "@/lib/ventas/cobros";
import { listarReservas } from "@/lib/ventas/reservas";
import { accionCancelarReserva } from "../acciones";

export const metadata = { title: "Reservas" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;
const ESTADOS: Record<string, string> = { activa: "Activa", cancelada: "Cancelada", vencida: "Vencida", convertida: "Retirada (vendida)" };

export default async function Reservas({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  await requiereUsuario();
  const todas = (await searchParams).todas === "1";
  const filas = await listarReservas(!todas);
  const senas = new Map(await Promise.all(filas.map(async (f) => [f.r.id, await senaDisponible(`reserva:${f.r.id}`)] as const)));
  return (
    <>
      <Encabezado
        titulo="Reservas"
        bajada="Piezas apartadas para un cliente, con o sin seña. Al vencer se liberan solas y la seña queda a favor del cliente."
        acciones={<Link href={todas ? "/ventas/reservas" : "/ventas/reservas?todas=1"} className={clasesBoton("secundario")}>{todas ? "Solo activas" : "Ver todas"}</Link>}
      />
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay reservas {todas ? "" : "activas"}. Se reservan desde el mostrador.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ r, cliente, items }) => {
              const sena = senas.get(r.id) ?? 0;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">N.º {r.id} · {cliente}</span>
                    <Etiqueta tono={r.estado === "activa" ? "champagne" : r.estado === "vencida" ? "alerta" : "neutro"}>{ESTADOS[r.estado] ?? r.estado}</Etiqueta>
                    {sena > 0 && <Etiqueta tono="ok">Seña {$(sena)}</Etiqueta>}
                  </div>
                  <p className="text-sm">{items.map((i) => `${i.codigo} · ${i.nombre}`).join(", ")}</p>
                  <p className="text-xs text-gris">
                    {fecha(r.fecha)} → vence el {fecha(r.vence)} · {r.precioCongelado ? `precio respetado: ${$(items.reduce((s, i) => s + i.i.precioPactado, 0))}` : "precio del día del retiro"}
                  </p>
                  {r.estado === "activa" && (
                    <div className="flex gap-2">
                      <Link href={`/mostrador?reserva=${r.id}`} className={clasesBoton("primario", "min-h-10 px-3")}>Retira: cobrar</Link>
                      <form action={accionCancelarReserva}><input type="hidden" name="id" value={r.id} /><button className={clasesBoton("fantasma", "min-h-10 px-3")}>Cancelar reserva</button></form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

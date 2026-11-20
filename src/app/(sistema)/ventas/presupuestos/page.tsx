import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, numero } from "@/lib/formato";
import { listarPresupuestos } from "@/lib/ventas/presupuestos";
import { accionAnularPresupuesto } from "../acciones";

export const metadata = { title: "Presupuestos" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

export default async function Presupuestos() {
  await requiereUsuario();
  const filas = await listarPresupuestos();
  const ahora = Date.now();
  return (
    <>
      <Encabezado titulo="Presupuestos" bajada="Se arman desde el mostrador. Guardan el precio del día hasta la fecha de validez; después se recalculan con la cotización nueva." />
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay presupuestos. En el mostrador, armá la venta y tocá «Presupuesto».</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ p, cliente }) => {
              const vencido = p.estado === "vigente" && p.vence.getTime() < ahora;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      N.º {String(p.numero).padStart(6, "0")}
                      {p.estado === "convertido" && <Etiqueta tono="ok">Vendido</Etiqueta>}
                      {p.estado === "anulado" && <Etiqueta>Anulado</Etiqueta>}
                      {vencido && <Etiqueta tono="alerta">Vencido</Etiqueta>}
                      {p.estado === "vigente" && !vencido && <Etiqueta tono="champagne">Vigente hasta el {fecha(p.vence)}</Etiqueta>}
                    </span>
                    <span className="block text-xs text-gris">{fecha(p.fecha)} · {cliente ?? "Sin cliente"}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{$(p.total)}</span>
                  <span className="flex w-full gap-2 sm:w-auto">
                    <a href={`/documentos/presupuesto/${p.id}`} target="_blank" className={clasesBoton("secundario", "min-h-10 flex-1 px-3")}>PDF</a>
                    {p.estado === "vigente" && <Link href={`/mostrador?presupuesto=${p.id}`} className={clasesBoton("primario", "min-h-10 flex-1 px-3")}>Vender</Link>}
                    {p.estado === "vigente" && (
                      <form action={accionAnularPresupuesto}><input type="hidden" name="id" value={p.id} /><button className={clasesBoton("fantasma", "min-h-10 px-3")}>Anular</button></form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

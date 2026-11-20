import Link from "next/link";
import { IconoFlecha, IconoMas } from "@/components/iconos";
import { BotonLink, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, numero } from "@/lib/formato";
import { TONO_REP } from "./vista";
import { ESTADOS_REPARACION, listarReparaciones, type EstadoReparacion } from "@/lib/taller/reparaciones";

export const metadata = { title: "Reparaciones" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;
const FILTROS: { k: string; t: string; e?: EstadoReparacion[] }[] = [
  { k: "", t: "En curso", e: ["recibida", "en_taller", "lista", "avisada"] },
  { k: "listas", t: "Para retirar", e: ["lista", "avisada"] },
  { k: "taller", t: "En el taller", e: ["en_taller"] },
  { k: "todas", t: "Todas" },
];

export default async function Reparaciones({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requiereUsuario();
  const ver = (await searchParams).ver ?? "";
  const filtro = FILTROS.find((f) => f.k === ver) ?? FILTROS[0];
  const filas = await listarReparaciones(filtro.e);
  const ahora = Date.now();
  return (
    <>
      <Encabezado titulo="Reparaciones" bajada="Cada pieza que entra queda con su número, fotos y estado. Se entrega cobrando desde el mostrador." acciones={<BotonLink href="/taller/nueva"><IconoMas className="size-4" /> Recibir reparación</BotonLink>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTROS.map((f) => (
          <Link key={f.k} href={f.k ? `/taller?ver=${f.k}` : "/taller"} className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm ${f.k === filtro.k ? "border-tinta bg-tinta text-white" : "border-linea-fuerte bg-superficie"}`}>{f.t}</Link>
        ))}
      </div>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay reparaciones acá.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ r, cliente }) => {
              const atrasada = ["recibida", "en_taller"].includes(r.estado) && r.fechaPrometida && r.fechaPrometida.getTime() < ahora;
              return (
                <li key={r.id}>
                  <Link href={`/taller/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-papel/60 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        N.º {r.numero} · {cliente}
                        <Etiqueta tono={TONO_REP[r.estado]}>{ESTADOS_REPARACION[r.estado as EstadoReparacion]}</Etiqueta>
                        {atrasada && <Etiqueta tono="error">Atrasada</Etiqueta>}
                      </span>
                      <span className="block truncate text-xs text-gris">{r.descripcion} · ingresó el {fecha(r.fechaIngreso)}{r.fechaPrometida ? ` · prometida ${fecha(r.fechaPrometida)}` : ""}</span>
                    </span>
                    {r.presupuesto != null && <span className="text-sm whitespace-nowrap tabular-nums">{$(r.presupuesto)}</span>}
                    <IconoFlecha className="size-4 shrink-0 text-gris" />
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

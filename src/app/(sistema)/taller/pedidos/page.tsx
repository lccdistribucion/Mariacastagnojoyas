import Link from "next/link";
import { IconoFlecha, IconoMas } from "@/components/iconos";
import { BotonLink, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, numero } from "@/lib/formato";
import { ESTADOS_PEDIDO, listarPedidos, type EstadoPedido } from "@/lib/taller/pedidos";
import { TONO_PED } from "../vista";

export const metadata = { title: "Pedidos a medida" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;
const FILTROS: { k: string; t: string; e?: EstadoPedido[] }[] = [
  { k: "", t: "En curso", e: ["presupuestado", "aprobado", "en_taller", "listo"] },
  { k: "listos", t: "Para entregar", e: ["listo"] },
  { k: "todos", t: "Todos" },
];

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requiereUsuario();
  const ver = (await searchParams).ver ?? "";
  const filtro = FILTROS.find((f) => f.k === ver) ?? FILTROS[0];
  const filas = await listarPedidos(filtro.e);
  const ahora = Date.now();
  return (
    <>
      <Encabezado titulo="Pedidos a medida" bajada="Del presupuesto a la entrega: seña, taller, metal entregado y merma." acciones={<BotonLink href="/taller/pedidos/nuevo"><IconoMas className="size-4" /> Nuevo pedido</BotonLink>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTROS.map((f) => (
          <Link key={f.k} href={f.k ? `/taller/pedidos?ver=${f.k}` : "/taller/pedidos"} className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm ${f.k === filtro.k ? "border-tinta bg-tinta text-white" : "border-linea-fuerte bg-superficie"}`}>{f.t}</Link>
        ))}
      </div>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay pedidos acá.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ p, cliente }) => {
              const atrasado = ["aprobado", "en_taller"].includes(p.estado) && p.entregaEstimada && p.entregaEstimada.getTime() < ahora;
              return (
                <li key={p.id}>
                  <Link href={`/taller/pedidos/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-papel/60 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        N.º {p.numero} · {cliente}
                        <Etiqueta tono={TONO_PED[p.estado]}>{ESTADOS_PEDIDO[p.estado as EstadoPedido]}</Etiqueta>
                        {atrasado && <Etiqueta tono="error">Atrasado</Etiqueta>}
                      </span>
                      <span className="block truncate text-xs text-gris">{p.descripcion} · {fecha(p.fecha)}{p.entregaEstimada ? ` · entrega ${fecha(p.entregaEstimada)}` : ""}</span>
                    </span>
                    <span className="text-sm whitespace-nowrap tabular-nums">{p.modoPrecio === "congelado" ? $(p.presupuesto) : "A cotización"}</span>
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

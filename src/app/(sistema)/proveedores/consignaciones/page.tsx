import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { fecha, numero } from "@/lib/formato";
import { consignacionesEntregadasLista, consignacionRecibida } from "@/lib/proveedores/consignaciones";
import { opcionesProveedores } from "@/lib/proveedores/proveedores";
import { listarStock } from "@/lib/stock/consultas";
import { ESTADOS, type EstadoPieza } from "@/lib/stock/tipos";
import { accionResolverEntregada } from "../acciones";
import { FormEntregar } from "./entregar";

export const metadata = { title: "Consignaciones" };

export default async function Consignaciones() {
  const [recibidas, entregadas, terceros, disponibles] = await Promise.all([consignacionRecibida(), consignacionesEntregadasLista(), opcionesProveedores(["revendedor"]), listarStock({ estado: "disponible", tipo: "unica" }, undefined, true)]);
  const porDueno = new Map<string, typeof recibidas>();
  for (const r of recibidas) porDueno.set(r.proveedor ?? r.p.consignante ?? "Sin dueño", [...(porDueno.get(r.proveedor ?? r.p.consignante ?? "Sin dueño") ?? []), r]);
  const abiertas = entregadas.filter((x) => x.it.estado === "entregada");
  return (
    <>
      <Encabezado titulo="Consignaciones" bajada="Recibidas: piezas de terceros en nuestro stock (se paga al venderlas). Entregadas: piezas nuestras en manos de revendedores o ferias." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-4 font-medium">Recibidas</h2>
          {recibidas.length === 0 ? (
            <Vacio>No hay piezas en consignación recibida. Se cargan como piezas con origen «Consignación».</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {[...porDueno].map(([dueno, piezas]) => (
                <li key={dueno} className="px-5 py-4">
                  <p className="font-medium">{piezas[0].p.proveedorId ? <Link href={`/proveedores/${piezas[0].p.proveedorId}`} className="hover:underline">{dueno}</Link> : dueno}</p>
                  <p className="mb-2 text-xs text-gris">{piezas.filter((x) => ["disponible", "reservado"].includes(x.p.estado)).length} en stock · {piezas.filter((x) => x.p.estado === "vendido").length} vendidas · {piezas.filter((x) => x.p.estado === "devuelto").length} devueltas</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {piezas.map((x) => (
                      <li key={x.p.id} className="flex justify-between gap-3">
                        <Link href={`/stock/${x.p.id}`} className="hover:underline"><span className="text-xs tracking-wider text-gris">{x.p.codigo}</span> {x.p.nombre}</Link>
                        <Etiqueta tono={x.p.estado === "vendido" ? "oscuro" : x.p.estado === "devuelto" ? "neutro" : "ok"}>{ESTADOS[x.p.estado as EstadoPieza]}</Etiqueta>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <div className="flex flex-col gap-6">
          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-4 font-medium">Entregadas ({abiertas.length} afuera)</h2>
            {entregadas.length === 0 ? (
              <Vacio>Todavía no se entregaron piezas en consignación.</Vacio>
            ) : (
              <ul className="divide-y divide-linea">
                {entregadas.map((x) => (
                  <li key={x.it.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <Link href={`/stock/${x.it.productoId}`} className="hover:underline"><span className="text-xs tracking-wider text-gris">{x.codigo}</span> {x.nombre}</Link>
                      <span className="block text-xs text-gris">{x.tercero} · {fecha(x.e.fecha)} · acordado $ {numero(x.it.precioAcordado / 100, 0)}</span>
                    </span>
                    {x.it.estado === "entregada" ? (
                      <span className="flex gap-2">
                        <form action={accionResolverEntregada}><input type="hidden" name="itemId" value={x.it.id} /><input type="hidden" name="resultado" value="vendida" /><button className={clasesBoton("primario")}>La vendió</button></form>
                        <form action={accionResolverEntregada}><input type="hidden" name="itemId" value={x.it.id} /><input type="hidden" name="resultado" value="devuelta" /><button className={clasesBoton("secundario")}>La devolvió</button></form>
                      </span>
                    ) : (
                      <Etiqueta tono={x.it.estado === "vendida" ? "oscuro" : "neutro"}>{x.it.estado === "vendida" ? "Vendida" : "Devuelta"}</Etiqueta>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <Tarjeta className="p-5">
            <h2 className="mb-1 font-medium">Entregar piezas en consignación</h2>
            {terceros.length === 0 ? (
              <p className="text-sm text-gris">Primero dá de alta al revendedor como proveedor con el rubro «Revendedor / feria». <Link href="/proveedores/nuevo" className="underline">Nuevo</Link></p>
            ) : (
              <FormEntregar terceros={terceros} piezas={disponibles.filas.filter((x) => x.p.origen !== "consignacion").map((x) => ({ id: x.p.id, codigo: x.p.codigo, nombre: x.p.nombre, precio: x.precio.vigente }))} />
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

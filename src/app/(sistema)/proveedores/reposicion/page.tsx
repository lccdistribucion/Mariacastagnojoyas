import Link from "next/link";
import { Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { sugerenciaReposicion } from "@/lib/proveedores/reposicion";

export const metadata = { title: "Reposición" };

export default async function Reposicion() {
  const lista = await sugerenciaReposicion();
  const grupos = new Map<string, typeof lista>();
  for (const x of lista) grupos.set(x.proveedor ?? "Sin proveedor asignado", [...(grupos.get(x.proveedor ?? "Sin proveedor asignado") ?? []), x]);
  return (
    <>
      <Encabezado titulo="Sugerencia de reposición" bajada="Artículos por cantidad en o por debajo del mínimo, agrupados por proveedor. Sugerido: llegar al doble del mínimo (con el módulo de Ventas se suma el ritmo de venta)." />
      {lista.length === 0 ? (
        <Tarjeta><Vacio>Nada para reponer: todo está por encima del mínimo.</Vacio></Tarjeta>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {[...grupos].map(([prov, items]) => (
            <Tarjeta key={prov}>
              <h2 className="border-b border-linea px-5 py-4 font-medium">{items[0].p.proveedorId ? <Link href={`/proveedores/${items[0].p.proveedorId}`} className="hover:underline">{prov}</Link> : prov}</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gris"><tr><th className="px-5 py-2 font-normal">Artículo</th><th className="px-3 py-2 text-right font-normal">Hay</th><th className="px-3 py-2 text-right font-normal">Mínimo</th><th className="px-5 py-2 text-right font-normal">Pedir</th></tr></thead>
                <tbody className="divide-y divide-linea">
                  {items.map((x) => (
                    <tr key={x.p.id}>
                      <td className="px-5 py-2.5"><Link href={`/stock/${x.p.id}`} className="hover:underline">{x.p.nombre}</Link> <span className="text-xs text-gris">{x.p.codigo}</span></td>
                      <td className="px-3 py-2.5 text-right text-error tabular-nums">{x.p.cantidad}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{x.p.stockMinimo}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{x.sugerido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          ))}
        </div>
      )}
    </>
  );
}

import { Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { hoyIso, numero } from "@/lib/formato";
import { comisiones } from "@/lib/ventas/consultas";

export const metadata = { title: "Comisiones" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

export default async function Comisiones({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const u = await requiereUsuario();
  const sp = await searchParams;
  const hoy = hoyIso();
  const desde = sp.desde ?? `${hoy.slice(0, 8)}01`;
  const hasta = sp.hasta ?? hoy;
  const todos = u.permisos.has("ver_ventas_de_todos");
  const filas = await comisiones(desde, hasta, todos ? undefined : u.id);
  return (
    <>
      <Encabezado titulo="Comisiones" bajada={`Por vendedor, sobre las ventas no anuladas. El porcentaje de cada uno se configura en Usuarios.${todos ? "" : " Ves solo las tuyas."}`} />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gris">Desde<input type="date" name="desde" defaultValue={desde} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Hasta<input type="date" name="hasta" defaultValue={hasta} className="campo" /></label>
          <button className="min-h-11 rounded-lg bg-tinta px-4 text-sm text-white">Ver</button>
        </form>
      </Tarjeta>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay ventas en ese período.</Vacio>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gris">
              <tr className="border-b border-linea"><th className="px-4 py-3 font-medium sm:px-5">Vendedor</th><th className="px-2 py-3 text-right font-medium">Ventas</th><th className="px-2 py-3 text-right font-medium">Vendido</th><th className="px-4 py-3 text-right font-medium sm:px-5">Comisión</th></tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {filas.map((f) => (
                <tr key={f.vendedorId}>
                  <td className="px-4 py-3 sm:px-5">{f.vendedor ?? "—"}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{f.ventas}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{$(f.total)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums sm:px-5">{$(f.comision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </>
  );
}

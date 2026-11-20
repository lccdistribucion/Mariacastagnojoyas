import { Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { fechaHora, numero } from "@/lib/formato";
import { movimientosDeMetal, saldoMetal } from "@/lib/stock/metal";

export const metadata = { title: "Metal propio" };
const $ = (c: number | null) => (c == null ? "—" : `$ ${numero(c / 100, 0)}`);

export default async function MetalPropio() {
  await requierePermiso("ver_costos");
  const [saldo, movs] = await Promise.all([saldoMetal(), movimientosDeMetal(60)]);
  return (
    <>
      <Encabezado titulo="Metal propio" bajada="Gramos de oro y plata en poder del negocio (compras de metal, canjes, fundición), valuados a la cotización de hoy." />
      <Tarjeta className="mb-6">
        {saldo.length === 0 ? (
          <Vacio>No hay metal propio registrado. Se suma al cargar una compra de «metal por gramo» y con los canjes del mostrador.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-gris"><tr><th className="px-5 py-3 font-normal">Ley</th><th className="px-3 py-3 text-right font-normal">Gramos</th><th className="px-3 py-3 text-right font-normal">Fino (g)</th><th className="px-3 py-3 text-right font-normal">Valor mercado</th><th className="px-3 py-3 text-right font-normal">Valor compra usado</th><th className="px-5 py-3 text-right font-normal">Costo</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {saldo.map((s) => (
                  <tr key={s.leyId}>
                    <td className="px-5 py-3 font-medium">{s.ley}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{numero(s.gramos, 2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{numero(s.finoGramos, 2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{$(s.valorMercado)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{$(s.valorCompra)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{$(s.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {movs.length > 0 && (
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-4 font-medium">Movimientos</h2>
          <ul className="divide-y divide-linea">
            {movs.map(({ m, ley }) => (
              <li key={m.id} className={`flex justify-between gap-3 px-5 py-3 text-sm ${m.anulado ? "text-gris line-through" : ""}`}>
                <span>{m.descripcion}<span className="block text-xs text-gris">{fechaHora(m.fecha)} · {ley}</span></span>
                <span className="tabular-nums">{m.pesoMg > 0 ? "+" : ""}{numero(m.pesoMg / 1000, 2)} g</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  );
}

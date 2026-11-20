import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, clasesBoton, Encabezado, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fechaHora } from "@/lib/formato";
import { compararInventario } from "@/lib/stock/inventario";
import { accionCerrar } from "../acciones";
import { Lector } from "./lector";

export const metadata = { title: "Toma de inventario" };

export default async function TomaInventario({ params }: { params: Promise<{ id: string }> }) {
  const u = await requiereUsuario();
  const id = Number((await params).id);
  const r = await compararInventario(id).catch(() => null);
  if (!r) notFound();
  const inv = r.inventario;
  const cerrado = !!inv.cerradoEn;

  const lista = (titulo: string, items: { codigo: string; nombre: string; id?: number | null; extra?: string }[], tono: string) => (
    <Tarjeta>
      <h2 className={`border-b border-linea px-5 py-3 font-medium ${tono}`}>{titulo} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gris">Ninguna.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-linea overflow-y-auto">
          {items.map((x, k) => (
            <li key={k} className="px-5 py-2.5 text-sm">
              {x.id ? <Link href={`/stock/${x.id}`} className="font-medium hover:underline">{x.codigo}</Link> : <span className="font-medium">{x.codigo}</span>} · {x.nombre}
              {x.extra && <span className="block text-xs text-gris">{x.extra}</span>}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );

  return (
    <>
      <Encabezado
        titulo={inv.nombre}
        bajada={`${inv.ubicacion ? `Solo ${inv.ubicacion}` : "Todo el local"} · empezó ${fechaHora(inv.iniciadoEn)}${cerrado ? ` · cerrada ${fechaHora(inv.cerradoEn)}` : ""}`}
        acciones={<Link href="/stock/inventario" className={clasesBoton("secundario")}>Volver</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          {!cerrado ? (
            <Tarjeta className="p-4 sm:p-5"><Lector inventarioId={id} leidas={r.leidos} /></Tarjeta>
          ) : (
            <Aviso tono="neutro">Toma cerrada. Para corregir el stock, entrá a cada pieza faltante y registrá el ajuste (con motivo «Diferencia de inventario»).</Aviso>
          )}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Deberían estar", r.esperados],
              ["Bien", r.correctos],
              ["Lecturas", r.leidos],
            ].map(([t, v]) => (
              <Tarjeta key={t} className="p-3"><p className="text-xs text-gris">{t}</p><p className="titulo-serif text-3xl">{v}</p></Tarjeta>
            ))}
          </div>
          {!cerrado && u.permisos.has("ajustar_stock") && (
            <form action={accionCerrar} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={id} />
              <button className={clasesBoton("primario")}>Terminar y cerrar la toma</button>
              <span className="text-xs text-gris">Cerrar no cambia el stock: deja el resultado guardado.</span>
            </form>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {lista("Faltantes (no se leyeron)", r.faltantes.map((x) => ({ ...x, extra: x.esperado > 1 ? `esperadas ${x.esperado}` : undefined })), "text-error")}
          {lista("Diferencias de cantidad", r.diferencias.map((x) => ({ ...x, extra: `sistema ${x.esperado} · contadas ${x.contado}` })), "text-alerta")}
          {lista("Sobrantes", r.sobrantes.map((x) => ({ ...x, extra: x.motivo })), "text-alerta")}
        </div>
      </div>
    </>
  );
}

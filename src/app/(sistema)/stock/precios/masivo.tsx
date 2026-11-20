"use client";
import { useState, useTransition } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { numero } from "@/lib/formato";
import type { FiltroMasivo } from "@/lib/stock/masivo";
import { aplicar, previaMasivo } from "./acciones";

type Fila = { id: number; codigo: string; nombre: string; moneda: string; listaAntes: number; listaDespues: number; ofertaAntes: number | null; ofertaDespues: number | null };
type Op = { id: number | string; nombre: string };

export function Masivo({ categorias, leyes, artesanos, sugerido }: { categorias: Op[]; leyes: Op[]; artesanos: string[]; sugerido: number | null }) {
  const [f, setF] = useState<FiltroMasivo>({});
  const [pct, setPct] = useState(sugerido != null ? String(sugerido).replace(".", ",") : "");
  const [redondeo, setRedondeo] = useState(1000);
  const [oferta, setOferta] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [msj, setMsj] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const opciones = () => ({ porcentaje: Number(pct.replace(",", ".")), redondeo, incluirOferta: oferta, motivo });
  const $ = (c: number | null, m: string) => (c == null ? "—" : `${m === "ARS" ? "$" : m} ${numero(c / 100, m === "ARS" ? 0 : 2)}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Categoría" htmlFor="m-cat">
          <select id="m-cat" className="campo" onChange={(e) => setF((x) => ({ ...x, categoriaId: Number(e.target.value) || undefined }))}>
            <option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Metal / ley" htmlFor="m-ley">
          <select id="m-ley" className="campo" onChange={(e) => setF((x) => ({ ...x, leyId: Number(e.target.value) || undefined }))}>
            <option value="">Todos</option>{leyes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Artesano / proveedor" htmlFor="m-art">
          <select id="m-art" className="campo" onChange={(e) => setF((x) => ({ ...x, artesano: e.target.value || undefined }))}>
            <option value="">Todos</option>{artesanos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Moneda del precio" htmlFor="m-mon">
          <select id="m-mon" className="campo" onChange={(e) => setF((x) => ({ ...x, moneda: e.target.value || undefined }))}>
            <option value="">Todas</option><option value="ARS">Pesos</option><option value="USD">Dólares</option><option value="EUR">Euros</option>
          </select>
        </Campo>
        <Campo etiqueta="Porcentaje (%)" htmlFor="m-pct" ayuda="Negativo para bajar (ej. −5).">
          <input id="m-pct" className="campo" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="8" />
        </Campo>
        <Campo etiqueta="Redondear (pesos)" htmlFor="m-red">
          <select id="m-red" className="campo" value={redondeo} onChange={(e) => setRedondeo(Number(e.target.value))}>
            <option value={0}>Sin redondeo</option><option value={100}>A $ 100</option><option value={1000}>A $ 1.000</option><option value={5000}>A $ 5.000</option>
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo etiqueta="Motivo" htmlFor="m-mot">
            <input id="m-mot" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: suba del oro de noviembre" />
          </Campo>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={oferta} onChange={(e) => setOferta(e.target.checked)} className="size-4 accent-tinta" /> Aplicar también a los precios de oferta</label>
      <div>
        <Boton
          variante="secundario"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              setMsj({});
              const r = await previaMasivo(f, opciones());
              if ("error" in r && r.error) return setMsj({ error: r.error });
              setFilas(r.filas ?? []);
              setElegidas(new Set((r.filas ?? []).map((x) => x.id)));
            })
          }
        >
          Ver vista previa
        </Boton>
      </div>
      {msj.error && <Aviso tono="error">{msj.error}</Aviso>}
      {msj.ok && <Aviso tono="ok">{msj.ok}</Aviso>}
      {filas && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gris">{filas.length} piezas con precio fijo coinciden. Las de precio por gramo no se tocan: se actualizan solas.</p>
          {filas.length > 0 && (
            <div className="max-h-[55dvh] overflow-auto rounded-lg border border-linea">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-papel text-left text-xs text-gris">
                  <tr><th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Todas" checked={elegidas.size === filas.length} onChange={(e) => setElegidas(e.target.checked ? new Set(filas.map((x) => x.id)) : new Set())} className="size-4 accent-tinta" /></th><th className="px-3 py-2 font-normal">Pieza</th><th className="px-3 py-2 text-right font-normal">Antes</th><th className="px-3 py-2 text-right font-normal">Después</th></tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {filas.map((x) => (
                    <tr key={x.id}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`Incluir ${x.codigo}`} checked={elegidas.has(x.id)} onChange={() => setElegidas((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} className="size-4 accent-tinta" /></td>
                      <td className="px-3 py-2"><span className="text-xs tracking-wider text-gris">{x.codigo}</span> {x.nombre}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gris tabular-nums">{$(x.listaAntes, x.moneda)}{x.ofertaAntes != null && <span className="block text-xs">oferta {$(x.ofertaAntes, x.moneda)}</span>}</td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums">{$(x.listaDespues, x.moneda)}{x.ofertaDespues != null && <span className="block text-xs font-normal">oferta {$(x.ofertaDespues, x.moneda)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filas.length > 0 && (
            <div>
              <Boton
                disabled={pendiente || !elegidas.size}
                onClick={() =>
                  confirm(`¿Actualizar el precio de ${elegidas.size} piezas?`) &&
                  iniciar(async () => {
                    const r = await aplicar(f, opciones(), [...elegidas]);
                    setMsj(r);
                    if (r.ok) setFilas(null);
                  })
                }
              >
                Aplicar a {elegidas.size} piezas
              </Boton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

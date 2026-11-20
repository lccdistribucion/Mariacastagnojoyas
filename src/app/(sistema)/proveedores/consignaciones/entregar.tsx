"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionEntregar } from "../acciones";

type Pieza = { id: number; codigo: string; nombre: string; precio: number | null };

export function FormEntregar({ terceros, piezas }: { terceros: { id: number; nombre: string }[]; piezas: Pieza[] }) {
  const [e, accion, enviando] = useActionState(accionEntregar, undefined);
  const [busca, setBusca] = useState("");
  const [elegidas, setElegidas] = useState<Record<number, string>>({});
  const vis = piezas.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(busca.toLowerCase())).slice(0, 80);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="A quién" htmlFor="terceroId">
          <select id="terceroId" name="terceroId" className="campo" required defaultValue=""><option value="" disabled>Elegí…</option>{terceros.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
        </Campo>
        <Campo etiqueta="Notas" htmlFor="entNotas"><input id="entNotas" name="notas" className="campo" placeholder="Feria de diciembre, plazo 30 días…" /></Campo>
      </div>
      <input type="search" className="campo" placeholder="Buscar pieza…" value={busca} onChange={(x) => setBusca(x.target.value)} aria-label="Buscar pieza" />
      <ul className="max-h-72 divide-y divide-linea overflow-y-auto rounded-lg border border-linea">
        {vis.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
              <input type="checkbox" name="productoId" value={p.id} checked={p.id in elegidas} onChange={(x) => setElegidas((s) => { const n = { ...s }; if (x.target.checked) n[p.id] = p.precio ? String(Math.round(p.precio / 100)) : ""; else delete n[p.id]; return n; })} className="size-4 accent-tinta" />
              <span className="text-xs tracking-wider text-gris">{p.codigo}</span> {p.nombre}
            </label>
            {p.id in elegidas && <input aria-label={`Precio acordado ${p.codigo}`} name={`precio-${p.id}`} className="campo w-36" inputMode="decimal" placeholder="Precio acordado $" value={elegidas[p.id]} onChange={(x) => setElegidas((s) => ({ ...s, [p.id]: x.target.value }))} />}
          </li>
        ))}
        {!vis.length && <li className="px-3 py-4 text-sm text-gris">No hay piezas disponibles.</li>}
      </ul>
      <p className="text-xs text-gris">Precio acordado: lo que el tercero nos paga si la vende (por defecto, el precio de hoy).</p>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <div><Boton disabled={enviando || !Object.keys(elegidas).length}>Entregar {Object.keys(elegidas).length || ""} pieza/s</Boton></div>
    </form>
  );
}

"use client";
import { useMemo, useState } from "react";
import { clasesBoton } from "@/components/ui";

type Pieza = { id: number; codigo: string; nombre: string; creado: number };

export function SelectorEtiquetas({ piezas, formato, conPrecio, q }: { piezas: Pieza[]; formato: string; conPrecio: boolean; q: string }) {
  const [busca, setBusca] = useState(q);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [fmt, setFmt] = useState(formato);
  const [precio, setPrecio] = useState(conPrecio);
  const [copias, setCopias] = useState(1);
  const visibles = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? piezas.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(t)) : piezas;
  }, [busca, piezas]);
  const alternar = (id: number) => setElegidas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const hoy = new Date().setHours(0, 0, 0, 0);
  const url = `/stock/etiquetas/pdf?ids=${[...elegidas].join(",")}&formato=${fmt}&precio=${precio ? 1 : 0}&copias=${copias}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-tinta-suave">Formato</span>
          <select className="campo" value={fmt} onChange={(e) => setFmt(e.target.value)}>
            <option value="colita">Colgante «colita» 70 × 12 mm</option>
            <option value="adhesiva">Adhesiva 40 × 25 mm (con QR)</option>
            <option value="a4">Hoja A4 · 24 etiquetas (impresora común)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-tinta-suave">Copias de cada una</span>
          <input className="campo" inputMode="numeric" value={copias} onChange={(e) => setCopias(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={precio} onChange={(e) => setPrecio(e.target.checked)} className="size-4 accent-tinta" /> Imprimir el precio
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className="campo max-w-sm" placeholder="Buscar pieza…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pieza" />
        <button type="button" className={clasesBoton("secundario")} onClick={() => setElegidas(new Set(visibles.map((p) => p.id)))}>Elegir las {visibles.length} visibles</button>
        <button type="button" className={clasesBoton("secundario")} onClick={() => setElegidas(new Set(piezas.filter((p) => p.creado >= hoy).map((p) => p.id)))}>Las cargadas hoy</button>
        {elegidas.size > 0 && <button type="button" className={clasesBoton("fantasma")} onClick={() => setElegidas(new Set())}>Ninguna</button>}
      </div>
      <ul className="max-h-[50dvh] divide-y divide-linea overflow-y-auto rounded-lg border border-linea">
        {visibles.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-papel/60">
              <input type="checkbox" checked={elegidas.has(p.id)} onChange={() => alternar(p.id)} className="size-4 accent-tinta" />
              <span className="w-24 shrink-0 text-xs tracking-wider text-gris">{p.codigo}</span>
              <span className="text-sm">{p.nombre}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-linea bg-superficie/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <a href={elegidas.size ? url : undefined} target="_blank" rel="noopener" aria-disabled={!elegidas.size} className={clasesBoton("primario", elegidas.size ? "" : "pointer-events-none opacity-50")}>
          Generar PDF ({elegidas.size * copias} etiquetas)
        </a>
        <span className="text-xs text-gris">Imprimí al 100 % (sin «ajustar a la página»).</span>
      </div>
    </div>
  );
}

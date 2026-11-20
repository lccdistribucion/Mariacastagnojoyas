"use client";
/** Elegir un cliente dentro de un formulario (deja el id en un campo oculto). */
import { useEffect, useState } from "react";
import { buscarClientes } from "@/app/(sistema)/mostrador/acciones";

type C = { id: number; nombre: string; documento: string | null };

export function ElegirCliente({ nombre = "clienteId", inicial = null }: { nombre?: string; inicial?: C | null }) {
  const [c, setC] = useState<C | null>(inicial);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<C[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    const t = setTimeout(() => buscarClientes(q).then(setRes), 250);
    return () => clearTimeout(t);
  }, [q]);
  if (c)
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-linea bg-papel/60 px-3">
        <input type="hidden" name={nombre} value={c.id} />
        <span className="font-medium">{c.nombre}{c.documento ? <span className="font-normal text-gris"> · {c.documento}</span> : null}</span>
        <button type="button" className="min-h-10 text-sm underline underline-offset-4" onClick={() => setC(null)}>Cambiar</button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <input className="campo" placeholder="Buscar por nombre, DNI o WhatsApp" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <ul className="divide-y divide-linea rounded-lg border border-linea">
          {res.map((x) => (
            <li key={x.id}>
              <button type="button" className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm hover:bg-papel" onClick={() => setC(x)}>
                {x.nombre}{x.documento ? <span className="text-gris"> · {x.documento}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gris">¿No está? <a href="/clientes/nuevo" target="_blank" className="underline">Dalo de alta</a> y volvé a buscarlo.</p>
    </div>
  );
}

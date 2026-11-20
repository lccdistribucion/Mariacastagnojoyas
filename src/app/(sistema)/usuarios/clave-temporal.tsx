"use client";
import { useState } from "react";

/** Muestra la clave temporal una sola vez, grande y fácil de dictar, con botón para copiarla. */
export function ClaveTemporal({ clave, titulo }: { clave: string; titulo: string }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <div className="rounded-xl border border-champagne/40 bg-champagne-suave/50 p-5">
      <p className="font-medium">{titulo}</p>
      <p className="mt-1 text-sm text-tinta-suave">Clave temporal (se muestra solo esta vez). Dásela a la persona: al ingresar va a tener que elegir su propia clave.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-lg border border-linea bg-superficie px-4 py-2 font-mono text-2xl tracking-[0.2em]" data-clave-temporal>{clave}</code>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-linea-fuerte bg-superficie px-4 text-sm"
          onClick={() => navigator.clipboard?.writeText(clave).then(() => setCopiada(true))}
        >
          {copiada ? "Copiada ✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

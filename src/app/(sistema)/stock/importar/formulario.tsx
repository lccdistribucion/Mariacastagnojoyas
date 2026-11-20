"use client";
import { startTransition, useActionState, useState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { accionImportar } from "./acciones";

type Vista = { fila: number; codigo: string; nombre: string; errores: string[] }[];
type Estado = { error?: string; ok?: string; vista?: Vista; nombreArchivo?: string } | undefined;

export function FormularioImportar() {
  const [e, accion, enviando] = useActionState(accionImportar as (p: Estado, f: FormData) => Promise<Estado>, undefined);
  // El archivo se guarda acá: así «Cargar» usa el mismo que se revisó, sin volver a elegirlo.
  const [archivo, setArchivo] = useState<File | null>(null);
  const enviar = (confirmar: boolean) => {
    if (!archivo) return;
    const f = new FormData();
    f.set("archivo", archivo);
    f.set("confirmar", confirmar ? "1" : "");
    startTransition(() => accion(f));
  };
  const validas = e?.vista?.filter((x) => !x.errores.length).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-tinta-suave">Archivo (.xlsx o .csv)</span>
        <input type="file" accept=".xlsx,.csv,text/csv" className="campo py-2" onChange={(x) => setArchivo(x.target.files?.[0] ?? null)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" disabled={enviando || !archivo} onClick={() => enviar(false)}>{enviando ? "Revisando…" : "Revisar el archivo"}</Boton>
        {e?.vista && validas > 0 && !e.ok && <Boton disabled={enviando} onClick={() => enviar(true)}>Cargar las {validas} filas válidas</Boton>}
      </div>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      {e?.vista && !e.ok && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            «{e.nombreArchivo}»: {e.vista.length} filas · <span className="text-ok">{validas} válidas</span>
            {e.vista.length - validas > 0 && <span className="text-error"> · {e.vista.length - validas} con errores (no se cargan)</span>}
          </p>
          <div className="max-h-[50dvh] overflow-auto rounded-lg border border-linea">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="sticky top-0 bg-papel text-left text-xs text-gris"><tr><th className="px-3 py-2 font-normal">Fila</th><th className="px-3 py-2 font-normal">Pieza</th><th className="px-3 py-2 font-normal">Resultado</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {e.vista.map((x) => (
                  <tr key={x.fila} className={x.errores.length ? "bg-error-suave/40" : ""}>
                    <td className="px-3 py-2 text-gris">{x.fila}</td>
                    <td className="px-3 py-2">{x.codigo && <span className="text-xs tracking-wider text-gris">{x.codigo} </span>}{x.nombre || "—"}</td>
                    <td className="px-3 py-2">{x.errores.length ? <span className="text-error">{x.errores.join(" · ")}</span> : <span className="text-ok">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { pesosTxt } from "@/components/pagos";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { accionConfirmarConciliacion, accionLeerExtracto } from "../acciones";

type Resultado = Awaited<ReturnType<typeof accionLeerExtracto>>;

export function PanelConciliacion({ bancos, bancoId }: { bancos: { id: number; nombre: string }[]; bancoId: number }) {
  const [r, accion, leyendo] = useActionState<Resultado | undefined, FormData>(accionLeerExtracto, undefined);
  const [quitar, setQuitar] = useState<Set<number>>(new Set());
  const [msj, setMsj] = useState<{ ok?: string; error?: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const router = useRouter();
  const datos = r && "propuestas" in r ? r : null;
  return (
    <Tarjeta className="p-5">
      <form action={accion} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gris">Cuenta<select name="cajaId" className="campo" defaultValue={bancoId} onChange={(e) => router.push(`/tesoreria/conciliacion?banco=${e.target.value}`)}>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-gris">Extracto (.xlsx o .csv)<input type="file" name="archivo" accept=".xlsx,.csv,.txt" className="campo py-2" required /></label>
        <Boton disabled={leyendo}>{leyendo ? "Leyendo…" : "Subir y comparar"}</Boton>
      </form>
      {r && "error" in r && r.error && <div className="mt-3"><Aviso tono="error">{r.error}</Aviso></div>}
      {datos && (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm">
            {datos.propuestas.filter((p) => p.movimiento).length} de {datos.propuestas.length} renglones coinciden con movimientos del sistema. Destildá los que no correspondan.
          </p>
          <ul className="divide-y divide-linea rounded-lg border border-linea">
            {datos.propuestas.map((p, i) => (
              <li key={i} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-3">
                <span>{p.fecha.split("-").reverse().join("/")} · {p.descripcion}</span>
                <span className="text-xs text-gris">
                  {p.movimiento ? (
                    <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={!quitar.has(i)} onChange={(e) => { const n = new Set(quitar); if (e.target.checked) n.delete(i); else n.add(i); setQuitar(n); }} /> = {p.movimiento.descripcion}</label>
                  ) : (
                    "Sin coincidencia (queda para revisar)"
                  )}
                </span>
                <span className={`text-right tabular-nums ${p.importe < 0 ? "text-error" : "text-ok"}`}>{pesosTxt(p.importe)}</span>
              </li>
            ))}
          </ul>
          {msj?.error && <Aviso tono="error">{msj.error}</Aviso>}
          {msj?.ok && <Aviso tono="ok">{msj.ok}</Aviso>}
          {!msj?.ok && (
            <div>
              <Boton type="button" disabled={guardando} onClick={() => iniciar(async () => {
                const res = await accionConfirmarConciliacion(datos.cajaId, datos.propuestas.map((p, i) => ({ fecha: p.fecha, descripcion: p.descripcion, importe: p.importe, movimientoId: p.movimiento && !quitar.has(i) ? p.movimiento.id : null })));
                setMsj(res ?? null);
                if (res?.ok) router.refresh();
              })}>Confirmar conciliación</Boton>
            </div>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { aCentavos, pesosTxt } from "@/components/pagos";
import { Aviso, Boton, Campo, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { accionAcreditar } from "../acciones";

type Cupon = { id: number; bruto: number; texto: string; esperada: string; atrasada: boolean; cajaId: number };
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export function PanelAcreditar({ cupones, bancos, bancoDefecto }: { cupones: Cupon[]; bancos: { id: number; nombre: string }[]; bancoDefecto: number | null }) {
  const [e, accion, enviando] = useActionState(accionAcreditar, undefined);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [neto, setNeto] = useState("");
  const [ret, setRet] = useState("");
  const bruto = cupones.filter((c) => sel.has(c.id)).reduce((s, c) => s + c.bruto, 0);
  const comision = bruto - aCentavos(neto) - aCentavos(ret);
  if (!cupones.length) return <Tarjeta><Vacio>No hay cobros con tarjeta pendientes de acreditar.</Vacio></Tarjeta>;
  return (
    <form onSubmit={enviar(accion)} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Tarjeta>
        <div className="flex items-center justify-between border-b border-linea px-5 py-3">
          <h2 className="font-medium">Pendientes ({cupones.length})</h2>
          <button type="button" className="text-sm underline underline-offset-4" onClick={() => setSel(sel.size === cupones.length ? new Set() : new Set(cupones.map((c) => c.id)))}>{sel.size === cupones.length ? "Ninguno" : "Todos"}</button>
        </div>
        <ul className="divide-y divide-linea">
          {cupones.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-5 py-2.5 text-sm">
                <input type="checkbox" name="ids" value={c.id} className="size-5" checked={sel.has(c.id)} onChange={(x) => { const n = new Set(sel); if (x.target.checked) n.add(c.id); else n.delete(c.id); setSel(n); }} />
                <span className="min-w-0 flex-1">{c.texto}<span className="flex items-center gap-2 text-xs text-gris">Esperada {c.esperada} {c.atrasada && <Etiqueta tono="alerta">Atrasada</Etiqueta>}</span></span>
                <span className="tabular-nums">{pesosTxt(c.bruto)}</span>
              </label>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta className="flex flex-col gap-3 self-start p-5">
        <h2 className="font-medium">Registrar la liquidación</h2>
        <p className="text-sm">Cupones elegidos: <strong className="tabular-nums">{pesosTxt(bruto)}</strong></p>
        <Campo etiqueta="Llegó al banco (neto) $" htmlFor="acNeto"><input id="acNeto" name="neto" className="campo" inputMode="decimal" value={neto} onChange={(x) => setNeto(x.target.value)} /></Campo>
        <Campo etiqueta="Retenciones (IVA, Ganancias, IIBB) $" htmlFor="acRet"><input id="acRet" name="retencion" className="campo" inputMode="decimal" value={ret} onChange={(x) => setRet(x.target.value)} placeholder="0" /></Campo>
        {bruto > 0 && aCentavos(neto) > 0 && <p className={`text-sm ${comision < 0 ? "text-error" : ""}`}>Comisión de la procesadora: <strong className="tabular-nums">{pesosTxt(comision)}</strong>{bruto ? ` (${((comision / bruto) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %)` : ""}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha" htmlFor="acFecha"><input id="acFecha" name="fecha" type="date" className="campo" defaultValue={hoy()} /></Campo>
          <Campo etiqueta="Banco" htmlFor="acBanco"><select id="acBanco" name="bancoId" className="campo" defaultValue={bancoDefecto ?? undefined}>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></Campo>
        </div>
        {e?.error && <Aviso tono="error">{e.error}</Aviso>}
        {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
        <Boton disabled={enviando || !sel.size}>Registrar acreditación</Boton>
      </Tarjeta>
    </form>
  );
}

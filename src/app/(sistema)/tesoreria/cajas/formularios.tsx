"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Boton } from "@/components/ui";
import { accionCaja, accionCategoria, accionSaldoInicial, type Estado } from "../acciones";

const pctTxt = (n: number) => String(n / 100).replace(".", ",");
function R({ e }: { e: Estado }) {
  if (e?.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e?.ok) return <p className="text-sm text-ok" role="status">{e.ok}</p>;
  return null;
}

type C = { id: number; nombre: string; tipo: string; moneda: string; arqueo: boolean; dias: number; comision: number; retencion: number; bancoId: number | null; activa: boolean; orden: number };

export function FilaCaja({ c, tipos, bancos }: { c?: C; tipos: Record<string, string>; bancos: { id: number; nombre: string }[] }) {
  const [e, accion, enviando] = useActionState(accionCaja, undefined);
  const [tipo, setTipo] = useState(c?.tipo ?? "efectivo");
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="orden" value={c?.orden ?? 99} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.6fr_1.2fr_0.7fr_auto_auto_auto] sm:items-center">
        <input name="nombre" className="campo col-span-2 sm:col-span-1" defaultValue={c?.nombre} placeholder="Nombre (ej.: Banco Galicia)" aria-label="Nombre de la caja" required />
        <select name="tipo" className="campo" value={tipo} onChange={(x) => setTipo(x.target.value)} aria-label="Tipo de caja">{Object.entries(tipos).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select name="moneda" className="campo" defaultValue={c?.moneda ?? "ARS"} aria-label="Moneda"><option>ARS</option><option>USD</option><option>EUR</option></select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="arqueo" value="1" defaultChecked={c?.arqueo ?? tipo === "efectivo"} className="size-4" /> Apertura y cierre</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activa" value="1" defaultChecked={c?.activa ?? true} className="size-4" /> Activa</label>
        <Boton variante="secundario" disabled={enviando}>{c ? "Guardar" : "Agregar"}</Boton>
      </div>
      {tipo === "tarjetas" && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-papel/60 p-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-gris">Días hasta acreditar<input name="dias" className="campo" inputMode="numeric" defaultValue={c?.dias ?? 10} /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Comisión estimada %<input name="comision" className="campo" inputMode="decimal" defaultValue={pctTxt(c?.comision ?? 0)} /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Retenciones estimadas %<input name="retencion" className="campo" inputMode="decimal" defaultValue={pctTxt(c?.retencion ?? 0)} /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Acredita en<select name="bancoId" className="campo" defaultValue={c?.bancoId ?? ""}>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        </div>
      )}
      <R e={e} />
    </form>
  );
}

export function FormSaldoInicial({ caja }: { caja: { id: number; nombre: string; moneda: string } }) {
  const [e, accion, enviando] = useActionState(accionSaldoInicial, undefined);
  if (e?.ok) return <p className="text-sm text-ok" role="status">{caja.nombre}: {e.ok}</p>;
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-1">
      <input type="hidden" name="cajaId" value={caja.id} />
      <div className="flex items-center gap-2">
        <label htmlFor={`si-${caja.id}`} className="w-40 shrink-0 text-sm">{caja.nombre}</label>
        <input id={`si-${caja.id}`} name="importe" className="campo flex-1" inputMode="decimal" placeholder={caja.moneda} />
        <Boton variante="secundario" disabled={enviando}>Cargar</Boton>
      </div>
      <R e={e} />
    </form>
  );
}

export function FilaCategoria({ c, tipo }: { c?: { id: number; nombre: string; activa: boolean }; tipo: "gasto" | "ingreso" }) {
  const [e, accion, enviando] = useActionState(accionCategoria, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-1">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="tipo" value={tipo} />
      <div className="flex items-center gap-2">
        <input name="nombre" className="campo flex-1" defaultValue={c?.nombre} placeholder="Nueva categoría" aria-label="Nombre de la categoría" />
        {c && <select name="activa" className="campo w-auto" defaultValue={c.activa ? "1" : "0"} aria-label="Estado"><option value="1">Activa</option><option value="0">Inactiva</option></select>}
        <Boton variante="fantasma" disabled={enviando}>{c ? "Guardar" : "Agregar"}</Boton>
      </div>
      <R e={e} />
    </form>
  );
}

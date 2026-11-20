"use client";
import { useActionState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionDatosVentas, accionMedio, accionPlan, type Estado } from "./acciones";

const pctTxt = (n: number) => String(n / 100).replace(".", ",");
function R({ e }: { e: Estado }) {
  if (e?.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e?.ok) return <p className="text-sm text-ok" role="status">{e.ok}</p>;
  return null;
}

export function FilaMedio({ m, tipos, cajas }: { m?: { id: number; nombre: string; tipo: string; moneda: string; ajustePct: number; activo: boolean; orden: number; cajaId: number | null }; tipos: Record<string, string>; cajas: { id: number; nombre: string; moneda: string }[] }) {
  const [e, accion, enviando] = useActionState(accionMedio, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-1">
      {m && <input type="hidden" name="id" value={m.id} />}
      <input type="hidden" name="orden" value={m?.orden ?? 99} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1.1fr_0.6fr_0.7fr_1.3fr_auto_auto] sm:items-center">
        <input name="nombre" className="campo col-span-2 sm:col-span-1" defaultValue={m?.nombre} placeholder="Nombre" aria-label="Nombre del medio" required />
        <select name="tipo" className="campo" defaultValue={m?.tipo ?? "otro"} aria-label="Tipo">{Object.entries(tipos).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select name="moneda" className="campo" defaultValue={m?.moneda ?? "ARS"} aria-label="Moneda"><option>ARS</option><option>USD</option><option>EUR</option></select>
        <label className="flex items-center gap-1 text-sm"><input name="ajuste" className="campo text-right" inputMode="decimal" defaultValue={m ? pctTxt(m.ajustePct) : "0"} aria-label="Recargo o descuento %" /> %</label>
        <select name="cajaId" className="campo col-span-2 sm:col-span-1" defaultValue={m?.cajaId ?? ""} aria-label="Caja donde entra">
          <option value="">No mueve caja</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>→ {c.nombre} ({c.moneda})</option>)}
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activo" value="1" defaultChecked={m?.activo ?? true} className="size-4" /> Activo</label>
        <Boton variante="secundario" disabled={enviando}>{m ? "Guardar" : "Agregar"}</Boton>
      </div>
      <R e={e} />
    </form>
  );
}

export function FilaPlan({ medioId, p }: { medioId: number; p?: { id: number; cuotas: number; recargoPct: number; activo: boolean } }) {
  const [e, accion, enviando] = useActionState(accionPlan, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-1">
      <input type="hidden" name="medioId" value={medioId} />
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
        <label className="flex items-center gap-1 text-sm"><input name="cuotas" className="campo text-right" inputMode="numeric" defaultValue={p?.cuotas ?? ""} placeholder="Cuotas" aria-label="Cantidad de cuotas" required /> cuotas</label>
        <label className="flex items-center gap-1 text-sm">+<input name="recargo" className="campo text-right" inputMode="decimal" defaultValue={p ? pctTxt(p.recargoPct) : "0"} aria-label="Recargo del plan %" /> %</label>
        <label className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" name="activo" value="1" defaultChecked={p?.activo ?? true} className="size-4" /> Activo</label>
        <Boton variante="fantasma" disabled={enviando}>{p ? "Guardar" : "Agregar"}</Boton>
      </div>
      <R e={e} />
    </form>
  );
}

type Datos = { direccion: string; telefono: string; cuit: string; web: string; garantia: number; garantiaTexto: string; valeMeses: number; reservaDias: number; presupuestoDias: number; abandono: number; condiciones: string };

export function FormDatosVentas({ v }: { v: Datos }) {
  const [e, accion, enviando] = useActionState(accionDatosVentas, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Dirección del local" htmlFor="dir"><input id="dir" name="direccion" className="campo" defaultValue={v.direccion} /></Campo>
        <Campo etiqueta="Teléfono / WhatsApp" htmlFor="tel"><input id="tel" name="telefono" className="campo" defaultValue={v.telefono} /></Campo>
        <Campo etiqueta="CUIT" htmlFor="cuit"><input id="cuit" name="cuit" className="campo" inputMode="numeric" defaultValue={v.cuit} /></Campo>
        <Campo etiqueta="Web o Instagram" htmlFor="web"><input id="web" name="web" className="campo" defaultValue={v.web} /></Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Garantía (meses)" htmlFor="gar"><input id="gar" name="garantia" className="campo" inputMode="numeric" defaultValue={v.garantia} /></Campo>
        <Campo etiqueta="Vigencia de vales y gift cards (meses)" htmlFor="vale"><input id="vale" name="valeMeses" className="campo" inputMode="numeric" defaultValue={v.valeMeses} /></Campo>
        <Campo etiqueta="Días de reserva" htmlFor="res"><input id="res" name="reservaDias" className="campo" inputMode="numeric" defaultValue={v.reservaDias} /></Campo>
        <Campo etiqueta="Validez de presupuestos (días)" htmlFor="pres"><input id="pres" name="presupuestoDias" className="campo" inputMode="numeric" defaultValue={v.presupuestoDias} /></Campo>
        <Campo etiqueta="Avisar reparaciones sin retirar a los (días)" htmlFor="aban"><input id="aban" name="abandono" className="campo" inputMode="numeric" defaultValue={v.abandono} /></Campo>
      </div>
      <Campo etiqueta="Texto del certificado de garantía" htmlFor="gtxt"><textarea id="gtxt" name="garantiaTexto" rows={3} className="campo" defaultValue={v.garantiaTexto} /></Campo>
      <Campo etiqueta="Condiciones de la recepción de reparaciones" htmlFor="cond"><textarea id="cond" name="condiciones" rows={3} className="campo" defaultValue={v.condiciones} /></Campo>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <div><Boton disabled={enviando}>Guardar</Boton></div>
    </form>
  );
}

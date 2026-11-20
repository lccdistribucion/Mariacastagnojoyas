"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionOperacion } from "./acciones";

type Caja = { id: number; nombre: string; moneda: string; tipo: string };
type Cat = { id: number; nombre: string; tipo: string };
const OPS = { gasto: "Gasto", ingreso: "Ingreso", transferencia: "Transferencia", divisas: "Compra / venta de divisas" } as const;
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export function Operaciones({ cajas, categorias, inicial = "gasto" }: { cajas: Caja[]; categorias: Cat[]; inicial?: keyof typeof OPS }) {
  const [op, setOp] = useState<keyof typeof OPS>(inicial);
  const [e, accion, enviando] = useActionState(accionOperacion, undefined);
  const [origen, setOrigen] = useState<number>(cajas[0]?.id ?? 0);
  const monedaOrigen = cajas.find((c) => c.id === origen)?.moneda ?? "ARS";
  const usables = cajas.filter((c) => c.tipo !== "cheques");
  const destinos = op === "transferencia" ? usables.filter((c) => c.moneda === monedaOrigen && c.id !== origen) : usables.filter((c) => c.moneda !== monedaOrigen && (c.moneda === "ARS" || monedaOrigen === "ARS"));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Operación">
        {(Object.keys(OPS) as (keyof typeof OPS)[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={op === k} onClick={() => setOp(k)} className={`min-h-10 rounded-full border px-4 text-sm ${op === k ? "border-tinta bg-tinta text-white" : "border-linea-fuerte bg-superficie"}`}>{OPS[k]}</button>
        ))}
      </div>
      <form onSubmit={enviar(accion)} className="grid gap-3 sm:grid-cols-2" key={op}>
        <input type="hidden" name="operacion" value={op} />
        {(op === "gasto" || op === "ingreso") && (
          <>
            <Campo etiqueta={op === "gasto" ? "Sale de" : "Entra en"} htmlFor="opCaja"><select id="opCaja" name="cajaId" className="campo">{usables.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</select></Campo>
            <Campo etiqueta="Categoría" htmlFor="opCat"><select id="opCat" name="categoriaId" className="campo">{categorias.filter((c) => c.tipo === op).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Importe" htmlFor="opImp"><input id="opImp" name="importe" className="campo" inputMode="decimal" required /></Campo>
            <Campo etiqueta="Fecha" htmlFor="opFecha"><input id="opFecha" name="fecha" type="date" className="campo" defaultValue={hoy()} /></Campo>
            <div className="sm:col-span-2"><Campo etiqueta="Detalle" htmlFor="opDesc"><input id="opDesc" name="descripcion" className="campo" placeholder={op === "gasto" ? "Ej.: luz de octubre, factura 1234" : "Ej.: aporte de capital"} required /></Campo></div>
          </>
        )}
        {(op === "transferencia" || op === "divisas") && (
          <>
            <Campo etiqueta="Sale de" htmlFor="opOrig"><select id="opOrig" name="origenId" className="campo" value={origen} onChange={(x) => setOrigen(Number(x.target.value))}>{usables.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</select></Campo>
            <Campo etiqueta="Entra en" htmlFor="opDest" ayuda={!destinos.length ? "No hay otra caja compatible." : undefined}><select id="opDest" name="destinoId" className="campo" key={`${op}-${origen}`}>{destinos.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</select></Campo>
            {op === "transferencia" ? (
              <Campo etiqueta={`Importe (${monedaOrigen})`} htmlFor="opImp"><input id="opImp" name="importe" className="campo" inputMode="decimal" required /></Campo>
            ) : (
              <>
                <Campo etiqueta={`Sale (${monedaOrigen})`} htmlFor="opImpO"><input id="opImpO" name="importeOrigen" className="campo" inputMode="decimal" required /></Campo>
                <Campo etiqueta={`Entra (${destinos[0]?.moneda ?? "—"})`} htmlFor="opImpD" ayuda="El cambio se calcula solo con los dos importes."><input id="opImpD" name="importeDestino" className="campo" inputMode="decimal" required /></Campo>
              </>
            )}
            <div className={op === "transferencia" ? "" : "sm:col-span-2"}><Campo etiqueta="Detalle (opcional)" htmlFor="opDesc"><input id="opDesc" name="descripcion" className="campo" /></Campo></div>
          </>
        )}
        <div className="flex flex-col gap-3 sm:col-span-2">
          {e?.error && <Aviso tono="error">{e.error}</Aviso>}
          {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
          <div><Boton disabled={enviando}>Registrar</Boton></div>
        </div>
      </form>
    </div>
  );
}

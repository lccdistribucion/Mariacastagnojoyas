"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { numero } from "@/lib/formato";
import { OrigenPago, type CajaOpcion, type ChequeOpcion } from "@/components/origen-pago";
import { accionCcProveedor, accionDevolverConsignacion, accionPago, type Estado } from "../acciones";

function Resultado({ e }: { e: Estado }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

type Pendiente = { id: number; descripcion: string; moneda: string; pendiente: number; vencimiento: number | null };

export function FormPago({ proveedorId, pendientes, esRevendedor, cotizacionUsd, cajas, cheques, leyes }: { proveedorId: number; pendientes: Pendiente[]; esRevendedor: boolean; cotizacionUsd: number | null; cajas: CajaOpcion[]; cheques: ChequeOpcion[]; leyes: { id: number; nombre: string }[] }) {
  const [importeCheque, setImporteCheque] = useState(0);
  const [e, accion, enviando] = useActionState(accionPago, undefined);
  const [sentido, setSentido] = useState<"pago" | "cobro">("pago");
  const [moneda, setMoneda] = useState(pendientes[0]?.moneda ?? "ARS");
  const [elegidas, setElegidas] = useState<Record<number, string>>({});
  const deMoneda = pendientes.filter((p) => p.moneda === moneda);
  const total = Object.entries(elegidas).reduce((s, [id, v]) => s + (deMoneda.some((p) => p.id === Number(id)) ? Number(v.replace(/\./g, "").replace(",", ".")) || 0 : 0), 0);
  const $ = (c: number) => `${moneda === "ARS" ? "$" : moneda} ${numero(c / 100, 2)}`;
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <input type="hidden" name="proveedorId" value={proveedorId} />
      {esRevendedor && (
        <div className="flex gap-2" role="radiogroup" aria-label="Tipo">
          {(["pago", "cobro"] as const).map((s) => (
            <label key={s} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm ${sentido === s ? "border-tinta bg-champagne-suave/50" : "border-linea-fuerte"}`}>
              <input type="radio" name="sentido" value={s} checked={sentido === s} onChange={() => setSentido(s)} className="sr-only" /> {s === "pago" ? "Le pagamos" : "Nos pagó"}
            </label>
          ))}
        </div>
      )}
      {!esRevendedor && <input type="hidden" name="sentido" value="pago" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Fecha" htmlFor="pFecha"><input id="pFecha" name="fecha" type="date" className="campo" defaultValue={hoy()} required /></Campo>
        <Campo etiqueta="Moneda" htmlFor="pMoneda">
          <select id="pMoneda" name="moneda" className="campo" value={moneda} onChange={(x) => setMoneda(x.target.value)}><option value="ARS">Pesos</option><option value="USD">Dólares</option><option value="EUR">Euros</option></select>
        </Campo>
        <Campo etiqueta="Importe" htmlFor="pImporte"><input id="pImporte" name="importe" className="campo" inputMode="decimal" required defaultValue={importeCheque ? String(importeCheque / 100).replace(".", ",") : total ? String(total).replace(".", ",") : ""} key={`${total}-${importeCheque}`} /></Campo>
        <OrigenPago moneda={moneda} cajas={cajas} cheques={cheques} leyes={leyes} sentido={sentido} alCambiarImporte={setImporteCheque} />
        {moneda !== "ARS" && <Campo etiqueta="Tipo de cambio" htmlFor="pTc"><input id="pTc" name="tipoCambio" className="campo" inputMode="decimal" defaultValue={cotizacionUsd ? String(cotizacionUsd).replace(".", ",") : ""} /></Campo>}
        <div className="sm:col-span-2"><Campo etiqueta="Nota" htmlFor="pNotas"><input id="pNotas" name="notas" className="campo" placeholder="N.º de transferencia, cheque…" /></Campo></div>
      </div>
      {sentido === "pago" && deMoneda.length > 0 && (
        <fieldset className="rounded-lg border border-linea p-3">
          <legend className="px-1 text-sm font-medium text-tinta-suave">Imputar a facturas pendientes</legend>
          <ul className="flex flex-col gap-2">
            {deMoneda.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" name="imputar" value={p.id} checked={p.id in elegidas} onChange={(x) => setElegidas((s) => { const n = { ...s }; if (x.target.checked) n[p.id] = String(p.pendiente / 100).replace(".", ","); else delete n[p.id]; return n; })} className="size-4 accent-tinta" />
                  <span>{p.descripcion} <span className="text-gris">· falta {$(p.pendiente)}{p.vencimiento ? ` · vence ${new Date(p.vencimiento).toLocaleDateString("es-AR")}` : ""}</span></span>
                </label>
                {p.id in elegidas && <input aria-label={`Importe a imputar a ${p.descripcion}`} name={`imp-${p.id}`} className="campo w-36" inputMode="decimal" value={elegidas[p.id]} onChange={(x) => setElegidas((s) => ({ ...s, [p.id]: x.target.value }))} />}
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <Resultado e={e} />
      <div><Boton disabled={enviando}>{sentido === "pago" ? "Registrar pago" : "Registrar cobro"}</Boton></div>
    </form>
  );
}

export function FormCcProveedor({ proveedorId }: { proveedorId: number }) {
  const [e, accion, enviando] = useActionState(accionCcProveedor, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="proveedorId" value={proveedorId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Tipo" htmlFor="cpTipo"><select id="cpTipo" name="tipo" className="campo"><option value="saldo_inicial">Saldo inicial</option><option value="nota_credito">Nota de crédito</option><option value="ajuste">Ajuste</option></select></Campo>
        <Campo etiqueta="Moneda" htmlFor="cpMon"><select id="cpMon" name="moneda" className="campo"><option value="ARS">Pesos</option><option value="USD">Dólares</option><option value="EUR">Euros</option></select></Campo>
        <Campo etiqueta="Importe" htmlFor="cpImp"><input id="cpImp" name="importe" className="campo" inputMode="decimal" required /></Campo>
        <Campo etiqueta="Sentido" htmlFor="cpSent"><select id="cpSent" name="sentido" className="campo"><option value="ledebemos">Le debemos</option><option value="nosdebe">Nos debe / a favor</option></select></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Detalle" htmlFor="cpDesc"><input id="cpDesc" name="descripcion" className="campo" required /></Campo></div>
        <Campo etiqueta="Vence" htmlFor="cpVen"><input id="cpVen" name="vencimiento" type="date" className="campo" /></Campo>
      </div>
      <Resultado e={e} />
      <div><Boton variante="secundario" disabled={enviando}>Registrar</Boton></div>
    </form>
  );
}

export function DevolverConsignadas({ proveedorId, piezas }: { proveedorId: number; piezas: { id: number; codigo: string; nombre: string }[] }) {
  const [e, accion, enviando] = useActionState(accionDevolverConsignacion, undefined);
  return (
    <form action={accion} onSubmit={(x) => !confirm("¿Devolver al dueño las piezas marcadas? Salen del stock.") && x.preventDefault()} className="flex flex-col gap-3">
      <input type="hidden" name="proveedorId" value={proveedorId} />
      <ul className="flex flex-col">
        {piezas.map((p) => (
          <li key={p.id}><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="productoId" value={p.id} className="size-4 accent-tinta" /> <span className="text-xs tracking-wider text-gris">{p.codigo}</span> {p.nombre}</label></li>
        ))}
      </ul>
      <Resultado e={e} />
      <div><Boton variante="secundario" disabled={enviando}>Devolver las marcadas</Boton></div>
    </form>
  );
}

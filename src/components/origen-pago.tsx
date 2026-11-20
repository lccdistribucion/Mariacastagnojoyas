"use client";
/**
 * De dónde sale un pago (o adónde entra un cobro): medio + caja, cheque de la cartera (endoso), cheque propio o
 * metal. Los campos viajan con el formulario: medio, cajaId, chequeModo, chequeTerceroId, chequeNumero,
 * chequeBancoId, chequeFechaPago, metalLeyId, metalGramos.
 */
import { useState } from "react";
import { Campo } from "@/components/ui";

export type CajaOpcion = { id: number; nombre: string; moneda: string; tipo: string };
export type ChequeOpcion = { id: number; texto: string; importe: number };

const MEDIOS: Record<string, string> = { transferencia: "Transferencia", efectivo: "Efectivo", cheque: "Cheque", tarjeta: "Tarjeta", metal: "Metal (gramos)", otro: "Otro" };

export function OrigenPago({ moneda, cajas, cheques = [], leyes = [], sentido = "pago", conMetal = true, conEndoso = true, alCambiarImporte }: { moneda: string; cajas: CajaOpcion[]; cheques?: ChequeOpcion[]; leyes?: { id: number; nombre: string }[]; sentido?: "pago" | "cobro"; conMetal?: boolean; conEndoso?: boolean; alCambiarImporte?: (centavos: number) => void }) {
  const [medio, setMedio] = useState("transferencia");
  const [modo, setModo] = useState<"tercero" | "propio">(cheques.length && conEndoso ? "tercero" : "propio");
  const deMoneda = cajas.filter((c) => c.moneda === moneda && (medio === "transferencia" ? ["banco", "billetera"].includes(c.tipo) : medio === "efectivo" ? c.tipo === "efectivo" : !["tarjetas", "cheques"].includes(c.tipo)));
  const bancos = cajas.filter((c) => c.tipo === "banco" && c.moneda === "ARS");
  const opciones = Object.entries(MEDIOS).filter(([k]) => (k !== "metal" || (conMetal && sentido === "pago")) && (k !== "cheque" || (moneda === "ARS" && sentido === "pago")));
  return (
    <>
      <Campo etiqueta="Medio" htmlFor="oMedio">
        <select id="oMedio" name="medio" className="campo" value={medio} onChange={(e) => setMedio(e.target.value)}>
          {opciones.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </Campo>
      {["transferencia", "efectivo", "tarjeta", "otro"].includes(medio) && (
        <Campo etiqueta={sentido === "pago" ? "Sale de" : "Entra en"} htmlFor="oCaja" ayuda={!deMoneda.length ? `No hay cajas en ${moneda} para este medio (Tesorería → Cajas).` : undefined}>
          <select id="oCaja" name="cajaId" className="campo" defaultValue={deMoneda[0]?.id ?? ""} key={`${medio}-${moneda}`}>
            {medio === "tarjeta" || medio === "otro" ? <option value="">No mueve caja</option> : null}
            {deMoneda.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}
      {medio === "cheque" && (
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-4">
          {conEndoso && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qué cheque">
              {(["tercero", "propio"] as const).map((k) => (
                <label key={k} className={`flex min-h-10 cursor-pointer items-center rounded-full border px-3 text-sm ${modo === k ? "border-tinta bg-tinta text-white" : "border-linea-fuerte"}`}>
                  <input type="radio" name="chequeModo" value={k} className="sr-only" checked={modo === k} onChange={() => setModo(k)} /> {k === "tercero" ? "Endosar uno de la cartera" : "Cheque propio"}
                </label>
              ))}
            </div>
          )}
          {!conEndoso && <input type="hidden" name="chequeModo" value="propio" />}
          {modo === "tercero" && conEndoso ? (
            cheques.length ? (
              <select name="chequeTerceroId" className="campo" aria-label="Cheque a endosar" onChange={(e) => alCambiarImporte?.(cheques.find((c) => c.id === Number(e.target.value))?.importe ?? 0)} defaultValue="">
                <option value="" disabled>Elegí el cheque</option>
                {cheques.map((c) => <option key={c.id} value={c.id}>{c.texto}</option>)}
              </select>
            ) : (
              <p className="text-sm text-gris">No hay cheques en cartera.</p>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="N.º de cheque" htmlFor="oChNum"><input id="oChNum" name="chequeNumero" className="campo" /></Campo>
              <Campo etiqueta="Banco (chequera)" htmlFor="oChBanco">
                <select id="oChBanco" name="chequeBancoId" className="campo">{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
              </Campo>
              <Campo etiqueta="Fecha de pago" htmlFor="oChFecha"><input id="oChFecha" name="chequeFechaPago" type="date" className="campo" /></Campo>
            </div>
          )}
        </div>
      )}
      {medio === "metal" && (
        <>
          <Campo etiqueta="Ley" htmlFor="oLey"><select id="oLey" name="metalLeyId" className="campo">{leyes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></Campo>
          <Campo etiqueta="Gramos que se entregan" htmlFor="oGr" ayuda="El importe es lo que vale ese metal para la cuenta."><input id="oGr" name="metalGramos" className="campo" inputMode="decimal" /></Campo>
        </>
      )}
    </>
  );
}

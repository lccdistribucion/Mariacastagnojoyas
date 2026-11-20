"use client";
import { useActionState, useState } from "react";
import { ElegirCliente } from "@/components/elegir-cliente";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionCheque, accionRecibirCheque } from "../acciones";

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export function FormRecibirCheque({ categorias, cliente }: { categorias: { id: number; nombre: string }[]; cliente: { id: number; nombre: string; documento: string | null } | null }) {
  const [e, accion, enviando] = useActionState(accionRecibirCheque, undefined);
  const [deCliente, setDeCliente] = useState(true);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="N.º" htmlFor="chNum"><input id="chNum" name="numero" className="campo" required /></Campo>
        <Campo etiqueta="Banco" htmlFor="chBanco"><input id="chBanco" name="banco" className="campo" required /></Campo>
        <Campo etiqueta="Importe $" htmlFor="chImp"><input id="chImp" name="importe" className="campo" inputMode="decimal" required /></Campo>
        <Campo etiqueta="Paga el" htmlFor="chPago"><input id="chPago" name="pago" type="date" className="campo" defaultValue={hoy()} required /></Campo>
        <Campo etiqueta="Librador" htmlFor="chLib"><input id="chLib" name="librador" className="campo" /></Campo>
        <Campo etiqueta="CUIT del librador" htmlFor="chCuit"><input id="chCuit" name="cuit" className="campo" inputMode="numeric" /></Campo>
      </div>
      <input type="hidden" name="emision" value={hoy()} />
      <div className="flex gap-2" role="radiogroup" aria-label="De quién">
        {[true, false].map((v) => (
          <label key={String(v)} className={`flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm ${deCliente === v ? "border-tinta bg-champagne-suave/50" : "border-linea-fuerte"}`}>
            <input type="radio" className="sr-only" checked={deCliente === v} onChange={() => setDeCliente(v)} /> {v ? "De un cliente (paga su cuenta)" : "Otro ingreso"}
          </label>
        ))}
      </div>
      {deCliente ? (
        <Campo etiqueta="Cliente"><ElegirCliente inicial={cliente} /></Campo>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Categoría" htmlFor="chCat"><select id="chCat" name="categoriaId" className="campo">{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
          <Campo etiqueta="Detalle" htmlFor="chDet"><input id="chDet" name="detalle" className="campo" /></Campo>
        </div>
      )}
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <div><Boton disabled={enviando}>Recibir cheque</Boton></div>
    </form>
  );
}

export function AccionesCheque({ id, estado, tipo, bancos, volver }: { id: number; estado: string; tipo: string; bancos: { id: number; nombre: string }[]; volver: string }) {
  const [e, accion, enviando] = useActionState(accionCheque, undefined);
  const [abierto, setAbierto] = useState<"depositar" | "rechazar" | null>(null);
  const puedeRechazar = tipo === "tercero" && ["en_cartera", "depositado", "endosado"].includes(estado);
  if (!puedeRechazar && !(tipo === "propio" && estado === "emitido")) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tipo === "tercero" && estado === "en_cartera" && <button type="button" className="min-h-9 rounded-full border border-linea-fuerte px-3 text-xs" onClick={() => setAbierto(abierto === "depositar" ? null : "depositar")}>Depositar</button>}
        {puedeRechazar && <button type="button" className="min-h-9 rounded-full border border-error/30 px-3 text-xs text-error" onClick={() => setAbierto(abierto === "rechazar" ? null : "rechazar")}>Rechazado</button>}
        {tipo === "propio" && estado === "emitido" && (
          <form onSubmit={enviar(accion)}><input type="hidden" name="id" value={id} /><input type="hidden" name="que" value="debitar" /><input type="hidden" name="volver" value={volver} /><button className="min-h-9 rounded-full border border-linea-fuerte px-3 text-xs" disabled={enviando}>Se debitó del banco</button></form>
        )}
      </div>
      {abierto && (
        <form onSubmit={enviar(accion)} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="que" value={abierto} />
          <input type="hidden" name="volver" value={volver} />
          {abierto === "depositar" ? (
            <select name="bancoId" className="campo w-auto" aria-label="Banco donde se deposita">{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
          ) : (
            <input name="motivo" className="campo w-auto flex-1" placeholder="Motivo (ej.: sin fondos)" aria-label="Motivo del rechazo" />
          )}
          <Boton variante="secundario" disabled={enviando} className="min-h-10">Confirmar</Boton>
        </form>
      )}
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
    </div>
  );
}

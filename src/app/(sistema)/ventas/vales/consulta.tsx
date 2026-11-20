"use client";
import { useActionState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { accionConsultarVale } from "../acciones";

type R = { error?: string; vale?: { codigo: string; tipo: string; monto: number; saldo: number; vence: string | null; anulado: boolean } } | undefined;

export function ConsultaVale() {
  const [r, accion, enviando] = useActionState<R, FormData>(accionConsultarVale, undefined);
  const v = r?.vale;
  return (
    <Tarjeta className="p-4 sm:p-5">
      <form onSubmit={enviar(accion)} className="flex gap-2">
        <input name="codigo" className="campo flex-1 uppercase placeholder:normal-case" placeholder="Consultar saldo: código GC-… o VL-…" aria-label="Código a consultar" required />
        <Boton variante="secundario" disabled={enviando}>Consultar</Boton>
      </form>
      {r?.error && <div className="mt-3"><Aviso tono="error">{r.error}</Aviso></div>}
      {v && (
        <div className="mt-3">
          <Aviso tono={v.saldo > 0 && !v.anulado && (!v.vence || new Date(v.vence) > new Date()) ? "ok" : "alerta"}>
            {v.codigo}: saldo <strong>$ {(v.saldo / 100).toLocaleString("es-AR")}</strong> de $ {(v.monto / 100).toLocaleString("es-AR")}
            {v.vence ? ` · vence el ${new Date(v.vence).toLocaleDateString("es-AR")}` : ""}
            {v.anulado ? " · ANULADO" : ""}
          </Aviso>
        </div>
      )}
    </Tarjeta>
  );
}

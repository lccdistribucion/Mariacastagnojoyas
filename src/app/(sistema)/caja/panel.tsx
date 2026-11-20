"use client";
import { useActionState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton } from "@/components/ui";
import { accionArqueo } from "./acciones";

export function FormArqueo({ cajaId, momento, moneda }: { cajaId: number; momento: "apertura" | "cierre"; moneda: string }) {
  const [e, accion, enviando] = useActionState(accionArqueo, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-2">
      <input type="hidden" name="cajaId" value={cajaId} />
      <input type="hidden" name="momento" value={momento} />
      <label className="flex flex-col gap-1 text-sm">
        Contado al {momento === "apertura" ? "abrir" : "cerrar"} ({moneda})
        <input name="contado" className="campo text-right text-lg tabular-nums" inputMode="decimal" aria-label={`Efectivo contado en la ${momento}`} required />
      </label>
      <input name="notas" className="campo" placeholder="Nota (opcional)" aria-label="Nota del arqueo" />
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono={e.diferencia ? "alerta" : "ok"}>{e.ok}</Aviso>}
      <Boton disabled={enviando}>{momento === "apertura" ? "Abrir caja" : "Cerrar caja"}</Boton>
    </form>
  );
}

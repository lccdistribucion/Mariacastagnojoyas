"use client";
import { useActionState } from "react";
import { ElegirCliente } from "@/components/elegir-cliente";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionNotaDebito } from "../acciones";

export function FormNotaDebito() {
  const [e, accion, enviando] = useActionState(accionNotaDebito, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <Campo etiqueta="Cliente"><ElegirCliente /></Campo>
      <Campo etiqueta="Concepto" htmlFor="ndConcepto"><input id="ndConcepto" name="concepto" className="campo" placeholder="Ej.: intereses por pago fuera de término" required /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Importe final $ (con IVA)" htmlFor="ndImporte"><input id="ndImporte" name="importe" className="campo" inputMode="decimal" required /></Campo>
        <Campo etiqueta="Alícuota de IVA" htmlFor="ndIva"><select id="ndIva" name="ivaPct" className="campo" defaultValue="2100"><option value="2100">21 %</option><option value="1050">10,5 %</option><option value="0">0 %</option></select></Campo>
      </div>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.aviso && <Aviso tono="alerta">{e.aviso}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <div><Boton disabled={enviando}>{enviando ? "Pidiendo el CAE…" : "Emitir nota de débito"}</Boton></div>
    </form>
  );
}

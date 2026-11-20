"use client";
import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionAnularCompra } from "../acciones";

export function AnularCompra({ compraId }: { compraId: number }) {
  const [e, accion, enviando] = useActionState(accionAnularCompra, undefined);
  return (
    <form action={accion} onSubmit={(x) => !confirm("¿Anular la compra? Se revierten el stock, el metal y la cuenta corriente.") && x.preventDefault()} className="flex flex-col gap-3">
      <input type="hidden" name="compraId" value={compraId} />
      <Campo etiqueta="Motivo de la anulación" htmlFor="motivo"><input id="motivo" name="motivo" className="campo" required minLength={3} /></Campo>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      <div><Boton variante="peligro" disabled={enviando}>Anular compra</Boton></div>
    </form>
  );
}

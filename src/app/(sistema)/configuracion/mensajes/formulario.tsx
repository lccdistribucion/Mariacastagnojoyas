"use client";
import { useActionState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { guardarMensajes } from "./acciones";

export function FormMensajes({ v }: { v: { cumpleanos: string; aniversario: string; saldo: string; reparacion: string; pedido: string; comprobante: string } }) {
  const [e, accion, enviando] = useActionState(guardarMensajes, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-5">
      <Campo etiqueta="Cumpleaños" htmlFor="mCumple" ayuda="{nombre} se reemplaza por el primer nombre del cliente."><textarea id="mCumple" name="cumpleanos" className="campo min-h-20" defaultValue={v.cumpleanos} /></Campo>
      <Campo etiqueta="Aniversario" htmlFor="mAniv"><textarea id="mAniv" name="aniversario" className="campo min-h-20" defaultValue={v.aniversario} /></Campo>
      <Campo etiqueta="Saldo pendiente" htmlFor="mSaldo" ayuda="{saldo} se reemplaza por lo que debe (por ejemplo «$ 25.000»)."><textarea id="mSaldo" name="saldo" className="campo min-h-20" defaultValue={v.saldo} /></Campo>
      <Campo etiqueta="Reparación lista" htmlFor="mRep" ayuda="{pieza} es la descripción de la pieza; {numero}, el número de reparación."><textarea id="mRep" name="reparacion" className="campo min-h-20" defaultValue={v.reparacion} /></Campo>
      <Campo etiqueta="Pedido a medida listo" htmlFor="mPed" ayuda="{numero} es el número del pedido."><textarea id="mPed" name="pedido" className="campo min-h-20" defaultValue={v.pedido} /></Campo>
      <Campo etiqueta="Comprobante de compra" htmlFor="mComp" ayuda="{numero} es el número de la venta."><textarea id="mComp" name="comprobante" className="campo min-h-20" defaultValue={v.comprobante} /></Campo>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <div><Boton disabled={enviando}>Guardar mensajes</Boton></div>
    </form>
  );
}

"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton } from "@/components/ui";
import { accionAnularVenta, accionDevolucion } from "../acciones";
import { accionAnularConNotaCredito, accionFacturarAPosteriori, accionFacturarVenta, accionReintentar } from "../../facturacion/acciones";

const $ = (c: number) => `$ ${(c / 100).toLocaleString("es-AR")}`;

export function FormAnular({ ventaId }: { ventaId: number }) {
  const [e, accion, enviando] = useActionState(accionAnularVenta, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="ventaId" value={ventaId} />
      <p className="text-sm text-gris">Se usa cuando la venta se cargó mal. Las piezas vuelven al stock, se revierten los cobros, la cuenta corriente, las gift cards y los canjes. Queda registrado quién y por qué.</p>
      <input name="motivo" className="campo" placeholder="Motivo (obligatorio)" aria-label="Motivo de la anulación" required />
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <Boton variante="peligro" disabled={enviando}>Anular la venta</Boton>
    </form>
  );
}

export function FormDevolucion({ ventaId, items, conCliente, cajas }: { ventaId: number; items: { id: number; descripcion: string; max: number; unitario: number }[]; conCliente: boolean; cajas: { id: number; nombre: string }[] }) {
  const [e, accion, enviando] = useActionState(accionDevolucion, undefined);
  const [marcados, setMarcados] = useState<Record<number, number>>({});
  const [forma, setForma] = useState("vale");
  const total = items.reduce((s, i) => s + (marcados[i.id] ?? 0) * i.unitario, 0);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="ventaId" value={ventaId} />
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="item" value={i.id} className="size-5" aria-label={`Devolver ${i.descripcion}`} checked={!!marcados[i.id]} onChange={(ev) => setMarcados({ ...marcados, [i.id]: ev.target.checked ? 1 : 0 })} />
            <span className="flex-1">{i.descripcion}</span>
            {i.max > 1 && <input type="number" name={`cant_${i.id}`} min={1} max={i.max} defaultValue={1} className="campo h-9 min-h-9 w-16 py-1" aria-label="Cantidad" onChange={(ev) => marcados[i.id] && setMarcados({ ...marcados, [i.id]: Number(ev.target.value) || 1 })} />}
          </li>
        ))}
      </ul>
      <select name="forma" className="campo" aria-label="Qué se le da al cliente" value={forma} onChange={(ev) => setForma(ev.target.value)}>
        <option value="vale">Vale de cambio (para usar en otra compra)</option>
        {conCliente && <option value="cuenta_corriente">Saldo a favor en su cuenta corriente</option>}
        <option value="reintegro">Reintegro de dinero</option>
      </select>
      {forma === "reintegro" && (
        <select name="cajaId" className="campo" aria-label="De qué caja sale el dinero">
          {cajas.map((c) => <option key={c.id} value={c.id}>Sale de: {c.nombre}</option>)}
        </select>
      )}
      <input name="motivo" className="campo" placeholder="Motivo (ej.: cambio de talle)" aria-label="Motivo de la devolución" required />
      {total > 0 && <p className="text-sm">Valor de lo devuelto: <strong className="tabular-nums">{$(total)}</strong> <span className="text-gris">(si la venta tuvo descuento, el sistema lo descuenta en proporción)</span></p>}
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <Boton variante="secundario" disabled={enviando || !total}>Registrar devolución</Boton>
    </form>
  );
}

type EstadoF = { ok?: string; error?: string; aviso?: string } | undefined;
function Mensaje({ e }: { e: EstadoF }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.aviso) return <Aviso tono="alerta">{e.aviso}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}

/** Botón de una acción fiscal (facturar, facturar a posteriori o reintentar) con su resultado. */
export function BotonFiscal({ que, id, texto, variante = "secundario" }: { que: "facturar" | "posteriori" | "reintentar"; id: number; texto: string; variante?: "primario" | "secundario" }) {
  const fn = que === "facturar" ? accionFacturarVenta : que === "posteriori" ? accionFacturarAPosteriori : accionReintentar;
  const [e, accion, enviando] = useActionState(fn, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-2">
      <input type="hidden" name={que === "reintentar" ? "id" : "ventaId"} value={id} />
      <Boton variante={variante} disabled={enviando}>{enviando ? "Pidiendo el CAE…" : texto}</Boton>
      <Mensaje e={e} />
    </form>
  );
}

export function FormAnularConNotaCredito({ facturaId }: { facturaId: number }) {
  const [e, accion, enviando] = useActionState(accionAnularConNotaCredito, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="facturaId" value={facturaId} />
      <p className="text-sm text-gris">La venta tiene factura electrónica: se emite una nota de crédito por el total y, cuando ARCA la autoriza, la venta se anula (vuelven el stock, los cobros y la caja).</p>
      <input name="motivo" className="campo" placeholder="Motivo (obligatorio)" aria-label="Motivo de la anulación" required />
      <Mensaje e={e} />
      <Boton variante="peligro" disabled={enviando}>{enviando ? "Pidiendo el CAE…" : "Anular con nota de crédito"}</Boton>
    </form>
  );
}

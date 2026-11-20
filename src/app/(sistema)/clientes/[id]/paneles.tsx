"use client";
import { useActionState, useState } from "react";
import { aCentavos, PanelPagos, type MedioCliente } from "@/components/pagos";
import { accionCobroCc, accionDevolverSaldo } from "../../ventas/acciones";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionCcManual, accionDeseo, type Estado } from "../acciones";

function Resultado({ e }: { e: Estado }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}

export function FormDeseo({ clienteId }: { clienteId: number }) {
  const [e, accion, enviando] = useActionState(accionDeseo, undefined);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="clienteId" value={clienteId} />
      <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
        <Campo etiqueta="Código de pieza" htmlFor="codigoDeseo"><input id="codigoDeseo" name="codigo" className="campo uppercase placeholder:normal-case" placeholder="Opcional" /></Campo>
        <Campo etiqueta="Qué le gustaría" htmlFor="descripcionDeseo"><input id="descripcionDeseo" name="descripcion" className="campo" placeholder="Anillo de compromiso en oro blanco" /></Campo>
        <Boton variante="secundario" disabled={enviando}>Agregar</Boton>
      </div>
      <Resultado e={e} />
    </form>
  );
}

export function FormCcManual({ clienteId }: { clienteId: number }) {
  const [e, accion, enviando] = useActionState(accionCcManual, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="clienteId" value={clienteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Tipo" htmlFor="ccTipo">
          <select id="ccTipo" name="tipo" className="campo"><option value="saldo_inicial">Saldo inicial (deuda anterior al sistema)</option><option value="ajuste">Ajuste</option></select>
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Importe $" htmlFor="ccImporte"><input id="ccImporte" name="importe" className="campo" inputMode="decimal" required /></Campo>
          <Campo etiqueta="El cliente" htmlFor="ccSentido">
            <select id="ccSentido" name="sentido" className="campo"><option value="debe">Debe</option><option value="favor">Tiene a favor</option></select>
          </Campo>
        </div>
        <Campo etiqueta="Detalle" htmlFor="ccDesc"><input id="ccDesc" name="descripcion" className="campo" required placeholder="Ej.: saldo del cuaderno, anillo de marzo" /></Campo>
        <Campo etiqueta="Vence (opcional)" htmlFor="ccVence"><input id="ccVence" name="vencimiento" type="date" className="campo" /></Campo>
      </div>
      <Resultado e={e} />
      <div><Boton variante="secundario" disabled={enviando}>Registrar</Boton></div>
    </form>
  );
}

export function FormCobroCc({ clienteId, saldo, medios, cot }: { clienteId: number; saldo: number; medios: MedioCliente[]; cot: { USD: number | null; EUR: number | null } }) {
  const [e, accion, enviando] = useActionState(accionCobroCc, undefined);
  const [importe, setImporte] = useState(String(saldo / 100).replace(".", ","));
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="clienteId" value={clienteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Importe $" htmlFor="cobroImporte"><input id="cobroImporte" className="campo" inputMode="decimal" value={importe} onChange={(ev) => setImporte(ev.target.value)} /></Campo>
        <Campo etiqueta="Detalle" htmlFor="cobroDetalle"><input id="cobroDetalle" name="detalle" className="campo" placeholder="Pago a cuenta" /></Campo>
      </div>
      {aCentavos(importe) > 0 && <PanelPagos key={aCentavos(importe)} total={aCentavos(importe)} medios={medios} cot={cot} nombre="pagos" />}
      <Resultado e={e} />
      <div><Boton disabled={enviando || aCentavos(importe) <= 0}>Registrar pago</Boton></div>
    </form>
  );
}

export function FormDevolverSaldo({ clienteId, maximo, cajas }: { clienteId: number; maximo: number; cajas: { id: number; nombre: string }[] }) {
  const [e, accion, enviando] = useActionState(accionDevolverSaldo, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="clienteId" value={clienteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Importe $" htmlFor="dsImporte"><input id="dsImporte" name="importe" className="campo" inputMode="decimal" defaultValue={String(maximo / 100).replace(".", ",")} /></Campo>
        <Campo etiqueta="Sale de" htmlFor="dsCaja"><select id="dsCaja" name="cajaId" className="campo">{cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
      </div>
      <Campo etiqueta="Motivo" htmlFor="dsMotivo"><input id="dsMotivo" name="motivo" className="campo" placeholder="Ej.: venció la reserva y pidió la seña" /></Campo>
      <Resultado e={e} />
      <div><Boton variante="secundario" disabled={enviando}>Registrar devolución</Boton></div>
    </form>
  );
}

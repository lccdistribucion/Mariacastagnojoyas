"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { aCentavos, PanelPagos, type MedioCliente } from "@/components/pagos";
import { Aviso, Boton } from "@/components/ui";
import { accionEstadoPedido, accionMetalPedido, accionSenaPedido } from "../../acciones";

export function PanelEstadoPedido({ id, pasos, talleres, tallerActual, conMetal }: { id: number; pasos: { k: string; t: string }[]; talleres: { id: number; nombre: string }[]; tallerActual: number | null; conMetal: boolean }) {
  const [e, accion, enviando] = useActionState(accionEstadoPedido, undefined);
  const [nuevo, setNuevo] = useState(pasos[0]?.k ?? "");
  if (!pasos.length) return <p className="text-sm text-gris">No hay cambios posibles.</p>;
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Nuevo estado">
        {pasos.map((p) => (
          <label key={p.k} className={`flex min-h-10 cursor-pointer items-center rounded-full border px-3 text-sm ${nuevo === p.k ? "border-tinta bg-tinta text-white" : "border-linea-fuerte"}`}>
            <input type="radio" name="estado" value={p.k} className="sr-only" checked={nuevo === p.k} onChange={() => setNuevo(p.k)} /> {p.t}
          </label>
        ))}
      </div>
      {nuevo === "en_taller" && (
        <select name="proveedorId" className="campo" defaultValue={tallerActual ?? ""} aria-label="Taller">
          <option value="">Taller propio / sin proveedor</option>
          {talleres.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      )}
      {nuevo === "listo" && (
        <div className="grid grid-cols-2 gap-2">
          {conMetal && <input name="pesoFinal" className="campo" inputMode="decimal" placeholder="Peso final (g)" aria-label="Peso final" />}
          <input name="costoTaller" className="campo" inputMode="decimal" placeholder="Costo del taller $" aria-label="Costo del taller" />
        </div>
      )}
      <input name="nota" className="campo" placeholder="Nota (opcional)" aria-label="Nota" />
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <Boton variante="secundario" disabled={enviando}>Guardar estado</Boton>
    </form>
  );
}

export function PanelMetal({ id }: { id: number }) {
  const [e, accion, enviando] = useActionState(accionMetalPedido, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <select name="sentido" className="campo" aria-label="Movimiento de metal"><option value="entrega">Le entregamos</option><option value="devolucion">Nos devuelve</option></select>
        <input name="gramos" className="campo" inputMode="decimal" placeholder="Gramos" aria-label="Gramos" />
        <Boton variante="secundario" disabled={enviando}>Anotar</Boton>
      </div>
      <p className="text-xs text-gris">Lo entregado sale del metal propio (Stock → Metal) y lo devuelto vuelve.</p>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
    </form>
  );
}

export function PanelPagoCuenta({ id, medios, cot }: { id: number; medios: MedioCliente[]; cot: { USD: number | null; EUR: number | null } }) {
  const [e, accion, enviando] = useActionState(accionSenaPedido, undefined);
  const [importe, setImporte] = useState("");
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input className="campo" inputMode="decimal" placeholder="Importe $" aria-label="Importe del pago a cuenta" value={importe} onChange={(ev) => setImporte(ev.target.value)} />
      {aCentavos(importe) > 0 && <PanelPagos key={aCentavos(importe)} total={aCentavos(importe)} medios={medios} cot={cot} nombre="pagos" />}
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <Boton variante="secundario" disabled={enviando || aCentavos(importe) <= 0}>Registrar pago</Boton>
    </form>
  );
}

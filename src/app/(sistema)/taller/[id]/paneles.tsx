"use client";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, clasesBoton } from "@/components/ui";
import { accionEstadoReparacion, accionPresupuestoReparacion, marcarAvisada } from "../acciones";

export function PanelEstado({ id, pasos, talleres, tallerActual }: { id: number; pasos: { k: string; t: string }[]; talleres: { id: number; nombre: string }[]; tallerActual: number | null }) {
  const [e, accion, enviando] = useActionState(accionEstadoReparacion, undefined);
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
      {nuevo === "lista" && <input name="costoTaller" className="campo" inputMode="decimal" placeholder="Costo que cobra el taller $ (va a su cuenta corriente)" aria-label="Costo del taller" />}
      <input name="nota" className="campo" placeholder="Nota (opcional)" aria-label="Nota" />
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      <Boton variante="secundario" disabled={enviando}>Guardar estado</Boton>
    </form>
  );
}

export function PanelImporte({ id, actual }: { id: number; actual: number | null }) {
  const [e, accion, enviando] = useActionState(accionPresupuestoReparacion, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-2">
        <input name="presupuesto" className="campo flex-1" inputMode="decimal" defaultValue={actual != null ? String(actual / 100).replace(".", ",") : ""} aria-label="Importe a cobrar" placeholder="$" />
        <Boton variante="secundario" disabled={enviando}>Guardar</Boton>
      </div>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
    </form>
  );
}

export function AvisoWhatsapp({ id, href }: { id: number; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" onClick={() => void marcarAvisada(id)} className={clasesBoton("secundario", "w-full")}>
      Avisar por WhatsApp que está lista
    </a>
  );
}

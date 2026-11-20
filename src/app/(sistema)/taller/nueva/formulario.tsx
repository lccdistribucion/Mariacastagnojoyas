"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ElegirCliente } from "@/components/elegir-cliente";
import { enviar } from "@/components/envio";
import { aCentavos, PanelPagos, type MedioCliente } from "@/components/pagos";
import { Aviso, Boton, Campo, Tarjeta } from "@/components/ui";
import { accionNuevaReparacion } from "../acciones";
import { subirFotos } from "../fotos";

export function FormReparacion({ trabajos, medios, cot, cliente }: { trabajos: Record<string, string>; medios: MedioCliente[]; cot: { USD: number | null; EUR: number | null }; cliente: { id: number; nombre: string; documento: string | null } | null }) {
  const [e, accion, enviando] = useActionState(accionNuevaReparacion, undefined);
  const [fotos, setFotos] = useState<File[]>([]);
  const [conSena, setConSena] = useState(false);
  const [sena, setSena] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!e?.id) return;
    (async () => {
      const err = await subirFotos("reparacion", e.id!, fotos);
      if (err) setAviso(`La reparación se registró, pero las fotos no: ${err}`);
      router.push(`/taller/${e.id}?aviso=creada`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.id]);
  return (
    <form onSubmit={enviar(accion)} className="grid gap-5 lg:grid-cols-2">
      <Tarjeta className="flex flex-col gap-4 p-5">
        <Campo etiqueta="Cliente"><ElegirCliente inicial={cliente} /></Campo>
        <Campo etiqueta="Pieza" htmlFor="descripcion"><input id="descripcion" name="descripcion" className="campo" placeholder="Ej.: anillo oro 18k con piedra azul" required /></Campo>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-tinta-suave">Trabajo a realizar</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(trabajos).map(([k, t]) => (
              <label key={k} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-linea-fuerte px-3 text-sm has-checked:border-tinta has-checked:bg-tinta has-checked:text-white">
                <input type="checkbox" name="trabajos" value={k} className="sr-only" /> {t}
              </label>
            ))}
          </div>
        </fieldset>
        <Campo etiqueta="Detalle y estado en que la deja" htmlFor="detalle"><textarea id="detalle" name="detalle" rows={3} className="campo" placeholder="Ej.: falta una garra, rayones en el aro, achicar a talle 14" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Peso al ingreso (g)" htmlFor="peso"><input id="peso" name="peso" className="campo" inputMode="decimal" /></Campo>
          <Campo etiqueta="Fecha prometida" htmlFor="fechaPrometida"><input id="fechaPrometida" name="fechaPrometida" type="date" className="campo" /></Campo>
        </div>
      </Tarjeta>
      <div className="flex flex-col gap-5">
        <Tarjeta className="flex flex-col gap-4 p-5">
          <Campo etiqueta="Presupuesto $" ayuda="Se puede dejar vacío y cargarlo cuando vuelva del taller." htmlFor="presupuesto"><input id="presupuesto" name="presupuesto" className="campo" inputMode="decimal" /></Campo>
          <Campo etiqueta="Fotos de cómo llega" ayuda="Desde el celular abre la cámara.">
            <input type="file" accept="image/*" capture="environment" multiple className="campo py-2" onChange={(ev) => setFotos([...(ev.target.files ?? [])])} aria-label="Fotos de la pieza" />
          </Campo>
          {fotos.length > 0 && <p className="text-xs text-gris">{fotos.length} foto/s para subir.</p>}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="conSena" value="1" className="size-5" checked={conSena} onChange={(ev) => setConSena(ev.target.checked)} /> Deja seña</label>
          {conSena && (
            <>
              <input className="campo" inputMode="decimal" placeholder="Importe de la seña $" aria-label="Importe de la seña" value={sena} onChange={(ev) => setSena(ev.target.value)} />
              {aCentavos(sena) > 0 && <PanelPagos total={aCentavos(sena)} medios={medios} cot={cot} nombre="pagos" />}
            </>
          )}
        </Tarjeta>
        {e?.error && <Aviso tono="error">{e.error}</Aviso>}
        {aviso && <Aviso tono="alerta">{aviso}</Aviso>}
        <Boton disabled={enviando || !!e?.id} className="w-full text-base">{enviando || e?.id ? "Guardando…" : "Registrar reparación"}</Boton>
      </div>
    </form>
  );
}

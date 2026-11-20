"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ElegirCliente } from "@/components/elegir-cliente";
import { enviar } from "@/components/envio";
import { aCentavos, PanelPagos, type MedioCliente } from "@/components/pagos";
import { Aviso, Boton, Campo, Tarjeta } from "@/components/ui";
import { accionNuevoPedido } from "../../acciones";
import { subirFotos } from "../../fotos";

export function FormPedido({ leyes, medios, cot, cliente }: { leyes: { id: number; nombre: string }[]; medios: MedioCliente[]; cot: { USD: number | null; EUR: number | null }; cliente: { id: number; nombre: string; documento: string | null } | null }) {
  const [e, accion, enviando] = useActionState(accionNuevoPedido, undefined);
  const [modo, setModo] = useState<"congelado" | "cotizacion">("congelado");
  const [fotos, setFotos] = useState<File[]>([]);
  const [conSena, setConSena] = useState(false);
  const [sena, setSena] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (!e?.id) return;
    (async () => {
      await subirFotos("pedido", e.id!, fotos);
      router.push(`/taller/pedidos/${e.id}?aviso=creado`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.id]);
  return (
    <form onSubmit={enviar(accion)} className="grid gap-5 lg:grid-cols-2">
      <Tarjeta className="flex flex-col gap-4 p-5">
        <Campo etiqueta="Cliente"><ElegirCliente inicial={cliente} /></Campo>
        <Campo etiqueta="Qué hay que hacer" htmlFor="descripcion"><textarea id="descripcion" name="descripcion" rows={3} className="campo" placeholder="Ej.: anillo solitario oro amarillo 18k, piedra de 4 mm" required /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Metal" htmlFor="leyId">
            <select id="leyId" name="leyId" className="campo"><option value="">—</option>{leyes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select>
          </Campo>
          <Campo etiqueta="Talle" htmlFor="talle"><input id="talle" name="talle" className="campo" /></Campo>
        </div>
        <Campo etiqueta="Piedras" htmlFor="piedras"><input id="piedras" name="piedras" className="campo" placeholder="Opcional" /></Campo>
        <Campo etiqueta="Entrega estimada" htmlFor="entrega"><input id="entrega" name="entrega" type="date" className="campo" /></Campo>
        <Campo etiqueta="Fotos o referencias" ayuda="Diseños, fotos que trae el cliente.">
          <input type="file" accept="image/*" multiple className="campo py-2" onChange={(ev) => setFotos([...(ev.target.files ?? [])])} aria-label="Fotos de referencia" />
        </Campo>
      </Tarjeta>
      <div className="flex flex-col gap-5">
        <Tarjeta className="flex flex-col gap-4 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-tinta-suave">Cómo se cobra</legend>
            <div className="grid gap-2">
              {([["congelado", "Precio pactado hoy (no cambia)"], ["cotizacion", "Gramos finales × valor del gramo el día de la entrega + hechura"]] as const).map(([k, t]) => (
                <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${modo === k ? "border-tinta bg-papel" : "border-linea"}`}>
                  <input type="radio" name="modoPrecio" value={k} checked={modo === k} onChange={() => setModo(k)} /> {t}
                </label>
              ))}
            </div>
          </fieldset>
          {modo === "congelado" ? (
            <Campo etiqueta="Precio pactado $" htmlFor="presupuesto"><input id="presupuesto" name="presupuesto" className="campo" inputMode="decimal" /></Campo>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Gramos estimados" htmlFor="gramos"><input id="gramos" name="gramos" className="campo" inputMode="decimal" /></Campo>
              <Campo etiqueta="Hechura $" htmlFor="hechura"><input id="hechura" name="hechura" className="campo" inputMode="decimal" /></Campo>
            </div>
          )}
          <Campo etiqueta="Notas" htmlFor="notas"><textarea id="notas" name="notas" rows={2} className="campo" /></Campo>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="conSena" value="1" className="size-5" checked={conSena} onChange={(ev) => setConSena(ev.target.checked)} /> Deja seña (queda aprobado)</label>
          {conSena && (
            <>
              <input className="campo" inputMode="decimal" placeholder="Importe de la seña $" aria-label="Importe de la seña" value={sena} onChange={(ev) => setSena(ev.target.value)} />
              {aCentavos(sena) > 0 && <PanelPagos total={aCentavos(sena)} medios={medios} cot={cot} nombre="pagos" />}
            </>
          )}
        </Tarjeta>
        {e?.error && <Aviso tono="error">{e.error}</Aviso>}
        <Boton disabled={enviando || !!e?.id} className="w-full text-base">{enviando || e?.id ? "Guardando…" : "Registrar pedido"}</Boton>
      </div>
    </form>
  );
}

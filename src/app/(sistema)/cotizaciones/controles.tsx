"use client";
import { enviar } from "@/components/envio";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { IconoActualizar } from "@/components/iconos";
import { accionCargaManual, actualizarAhora, type EstadoAccion } from "./acciones";

export function BotonActualizar() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<EstadoAccion>();
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Boton
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setR(await actualizarAhora());
            router.refresh();
          })
        }
      >
        <IconoActualizar className={`size-4 ${pendiente ? "animate-spin" : ""}`} />
        {pendiente ? "Actualizando…" : "Actualizar ahora"}
      </Boton>
      {r?.ok && <p className="text-xs text-ok" role="status">{r.ok}</p>}
      {r?.error && <p className="text-xs text-error" role="alert">{r.error}</p>}
    </div>
  );
}

export function FormularioManual({ opciones }: { opciones: { codigo: string; nombre: string }[] }) {
  const [estado, accion, enviando] = useActionState(accionCargaManual, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Cotización" htmlFor="codigo">
          <select id="codigo" name="codigo" className="campo" required defaultValue="">
            <option value="" disabled>Elegí…</option>
            {opciones.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Compra" htmlFor="compra" ayuda="Metales: dólares por onza.">
          <input id="compra" name="compra" className="campo" inputMode="decimal" required placeholder="1.580,00" />
        </Campo>
        <Campo etiqueta="Venta" htmlFor="venta" ayuda="Vacío = igual a compra.">
          <input id="venta" name="venta" className="campo" inputMode="decimal" placeholder="1.600,00" />
        </Campo>
      </div>
      <Campo etiqueta="Nota (opcional)" htmlFor="nota">
        <input id="nota" name="nota" className="campo" maxLength={120} placeholder="Por ejemplo: la fuente no actualizó" />
      </Campo>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-linea bg-papel/60 p-3">
        <input type="checkbox" name="fijar" className="mt-0.5 size-4 accent-tinta" />
        <span className="text-sm">
          <span className="font-medium">Fijar como cotización propia del negocio</span>
          <span className="block text-xs text-gris">La actualización automática no la reemplaza hasta que la quites. Sin marcar, vale hasta la próxima actualización.</span>
        </span>
      </label>
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div><Boton disabled={enviando}>{enviando ? "Guardando…" : "Guardar cotización"}</Boton></div>
    </form>
  );
}

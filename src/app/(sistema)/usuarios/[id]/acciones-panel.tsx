"use client";
import { useActionState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { accionUsuario } from "../acciones";
import { ClaveTemporal } from "../clave-temporal";

/** Acciones sobre un usuario: reiniciar clave, desbloquear, desactivar/reactivar (cada una pide confirmación). */
export function PanelAcciones({ id, activo, bloqueado, esUnoMismo }: { id: number; activo: boolean; bloqueado: boolean; esUnoMismo: boolean }) {
  const [estado, accion, enviando] = useActionState(accionUsuario, undefined);
  const boton = (que: string, texto: string, confirmar: string, variante: "secundario" | "peligro" = "secundario") => (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm(confirmar)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="accion" value={que} />
      <Boton variante={variante} disabled={enviando} className="w-full">{texto}</Boton>
    </form>
  );
  return (
    <div className="flex flex-col gap-3">
      {estado?.claveTemporal ? <ClaveTemporal clave={estado.claveTemporal} titulo="Clave reiniciada" /> : estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      {!esUnoMismo && activo && boton("reiniciar", "Generar clave automática", "¿Generar una clave temporal nueva? Se cerrarán sus sesiones abiertas.")}
      {!esUnoMismo && activo && (
        <form
          action={accion}
          className="flex flex-col gap-2 rounded-lg border border-linea p-3"
          onSubmit={(e) => {
            if (!confirm("¿Cambiar la clave de este usuario? Se cerrarán sus sesiones abiertas.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="accion" value="poner_clave" />
          <label htmlFor={`clave-${id}`} className="text-sm font-medium text-tinta-suave">Elegir la clave yo</label>
          <input
            id={`clave-${id}`}
            name="clave"
            type="text"
            autoComplete="off"
            placeholder="Mínimo 8, con letras y números"
            className="min-h-11 rounded-lg border border-linea-fuerte bg-superficie px-3 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-tinta-suave">
            <input type="checkbox" name="obligarCambio" defaultChecked /> Que la cambie al ingresar
          </label>
          <Boton variante="secundario" disabled={enviando} className="w-full">Guardar esta clave</Boton>
        </form>
      )}
      {bloqueado && boton("desbloquear", "Desbloquear ingreso", "¿Desbloquear el ingreso de este usuario?")}
      {!esUnoMismo &&
        (activo
          ? boton("desactivar", "Desactivar usuario", "¿Desactivar este usuario? No podrá ingresar, pero su historial se conserva.", "peligro")
          : boton("reactivar", "Reactivar usuario", "¿Reactivar este usuario?"))}
      {esUnoMismo && <p className="text-xs text-gris">Tu propia clave la cambiás desde «Cambiar mi clave» (abajo a la izquierda, en tu nombre).</p>}
    </div>
  );
}

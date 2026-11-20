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
      {!esUnoMismo && activo && boton("reiniciar", "Reiniciar clave", "¿Generar una clave temporal nueva? Se cerrarán sus sesiones abiertas.")}
      {bloqueado && boton("desbloquear", "Desbloquear ingreso", "¿Desbloquear el ingreso de este usuario?")}
      {!esUnoMismo &&
        (activo
          ? boton("desactivar", "Desactivar usuario", "¿Desactivar este usuario? No podrá ingresar, pero su historial se conserva.", "peligro")
          : boton("reactivar", "Reactivar usuario", "¿Reactivar este usuario?"))}
      {esUnoMismo && <p className="text-xs text-gris">Tu propia clave la cambiás desde «Cambiar mi clave» (abajo a la izquierda, en tu nombre).</p>}
    </div>
  );
}

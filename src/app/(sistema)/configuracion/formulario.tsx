"use client";
import { enviar } from "@/components/envio";
import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { guardarSeguridad } from "./acciones";

type Valores = { nombre: string; intentos: number; bloqueo: number; inactividad: number; horas: number; descuento: number };

export function FormularioConfig({ v }: { v: Valores }) {
  const [estado, accion, enviando] = useActionState(guardarSeguridad, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-6">
      <Campo etiqueta="Nombre del negocio" htmlFor="nombre">
        <input id="nombre" name="nombre" className="campo" defaultValue={v.nombre} required maxLength={80} />
      </Campo>
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-gris">Seguridad</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="Intentos fallidos antes de bloquear" htmlFor="intentos" ayuda="Entre 3 y 20.">
            <input id="intentos" name="intentos" className="campo" inputMode="numeric" defaultValue={v.intentos} required />
          </Campo>
          <Campo etiqueta="Minutos de bloqueo" htmlFor="bloqueo" ayuda="El administrador puede desbloquear antes desde Usuarios.">
            <input id="bloqueo" name="bloqueo" className="campo" inputMode="numeric" defaultValue={v.bloqueo} required />
          </Campo>
          <Campo etiqueta="Cerrar sesión tras minutos sin uso" htmlFor="inactividad" ayuda="Recomendado: 15 a 30 en el mostrador.">
            <input id="inactividad" name="inactividad" className="campo" inputMode="numeric" defaultValue={v.inactividad} required />
          </Campo>
          <Campo etiqueta="Duración máxima de una sesión (horas)" htmlFor="horas" ayuda="Pasado ese tiempo hay que volver a ingresar.">
            <input id="horas" name="horas" className="campo" inputMode="numeric" defaultValue={v.horas} required />
          </Campo>
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-gris">Ventas</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="Descuento máximo sin autorización (%)" htmlFor="descuento" ayuda="Vale para todos los usuarios, salvo que tengan uno propio. Por encima, se pide la clave de un administrador.">
            <input id="descuento" name="descuento" className="campo" inputMode="decimal" defaultValue={String(v.descuento / 100).replace(".", ",")} required />
          </Campo>
        </div>
      </div>
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado?.ok && <Aviso tono="ok">{estado.ok}</Aviso>}
      <div><Boton disabled={enviando}>{enviando ? "Guardando…" : "Guardar configuración"}</Boton></div>
    </form>
  );
}

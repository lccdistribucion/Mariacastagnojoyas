"use client";
import { useActionState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { ingresar } from "./acciones";

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(ingresar, undefined);
  return (
    <form action={accion} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="usuario" className="text-sm font-medium text-tinta-suave">Usuario</label>
        <input id="usuario" name="usuario" className="campo" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required defaultValue={estado?.usuario} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="clave" className="text-sm font-medium text-tinta-suave">Clave</label>
        <input id="clave" name="clave" type="password" className="campo" autoComplete="current-password" required />
      </div>
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      <Boton type="submit" disabled={enviando} className="mt-1 w-full">
        {enviando ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}

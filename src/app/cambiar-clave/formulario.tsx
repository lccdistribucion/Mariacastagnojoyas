"use client";
import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { cambiarClave } from "./acciones";

export function FormularioClave() {
  const [estado, accion, enviando] = useActionState(cambiarClave, undefined);
  return (
    <form action={accion} className="flex flex-col gap-5">
      <Campo etiqueta="Clave actual (o la temporal que te dieron)" htmlFor="actual">
        <input id="actual" name="actual" type="password" className="campo" autoComplete="current-password" required />
      </Campo>
      <Campo etiqueta="Clave nueva" htmlFor="nueva" ayuda="Al menos 8 caracteres, con letras y números.">
        <input id="nueva" name="nueva" type="password" className="campo" autoComplete="new-password" required minLength={8} />
      </Campo>
      <Campo etiqueta="Repetí la clave nueva" htmlFor="repetir">
        <input id="repetir" name="repetir" type="password" className="campo" autoComplete="new-password" required minLength={8} />
      </Campo>
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      <Boton type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar clave nueva"}</Boton>
    </form>
  );
}

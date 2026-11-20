"use client";
import { useActionState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { accionReintentarTodo } from "../acciones";

export function ReintentarTodo() {
  const [e, accion, enviando] = useActionState(accionReintentarTodo, undefined);
  return (
    <form action={accion} className="flex flex-col items-end gap-2">
      <Boton disabled={enviando}>{enviando ? "Reintentando…" : "Reintentar todos"}</Boton>
      {e?.ok && <Aviso tono="ok">{e.ok}</Aviso>}
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
    </form>
  );
}

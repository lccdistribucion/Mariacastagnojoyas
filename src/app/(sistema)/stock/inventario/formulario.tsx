"use client";
import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionAbrir } from "./acciones";

export function FormularioNuevaToma({ ubicaciones }: { ubicaciones: { id: number; nombre: string }[] }) {
  const [e, accion, enviando] = useActionState(accionAbrir, undefined);
  const hoy = new Date().toLocaleDateString("es-AR");
  return (
    <form action={accion} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Campo etiqueta="Nombre" htmlFor="nombre">
        <input id="nombre" name="nombre" className="campo" defaultValue={`Inventario ${hoy}`} required />
      </Campo>
      <Campo etiqueta="Qué se cuenta" htmlFor="ubicacionId">
        <select id="ubicacionId" name="ubicacionId" className="campo">
          <option value="">Todo el local</option>
          {ubicaciones.map((u) => <option key={u.id} value={u.id}>Solo {u.nombre}</option>)}
        </select>
      </Campo>
      <Boton disabled={enviando}>Empezar a contar</Boton>
      {e?.error && <div className="sm:col-span-3"><Aviso tono="error">{e.error}</Aviso></div>}
    </form>
  );
}

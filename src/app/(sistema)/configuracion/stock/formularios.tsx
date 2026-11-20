"use client";
import { useActionState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo } from "@/components/ui";
import { accionCatalogo, accionOpciones, accionQuitarDemo, type Estado } from "./acciones";

function Resultado({ e }: { e: Estado }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}

type Item = { id?: number; nombre: string; prefijo?: string; ajustePct?: number; activo: boolean; orden: number };

export function FilaCatalogo({ que, item }: { que: "categoria" | "ubicacion" | "lista"; item?: Item }) {
  const [e, accion, enviando] = useActionState(accionCatalogo, undefined);
  const sufijo = `${que}-${item?.id ?? "nueva"}`;
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-2">
      <input type="hidden" name="que" value={que} />
      {item?.id && <input type="hidden" name="id" value={item.id} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Campo etiqueta={item ? "Nombre" : `Agregar ${que === "categoria" ? "categoría" : que === "ubicacion" ? "ubicación" : "lista"}`} htmlFor={`n-${sufijo}`}>
            <input id={`n-${sufijo}`} name="nombre" className="campo" defaultValue={item?.nombre} required />
          </Campo>
        </div>
        {que === "categoria" && (
          <div className="w-24">
            <Campo etiqueta="Prefijo" htmlFor={`p-${sufijo}`}>
              <input id={`p-${sufijo}`} name="prefijo" className="campo uppercase" defaultValue={item?.prefijo} required maxLength={5} />
            </Campo>
          </div>
        )}
        {que === "lista" && (
          <div className="w-28">
            <Campo etiqueta="Ajuste %" htmlFor={`a-${sufijo}`}>
              <input id={`a-${sufijo}`} name="ajuste" className="campo" inputMode="decimal" defaultValue={item ? String((item.ajustePct ?? 0) / 100).replace(".", ",") : "0"} />
            </Campo>
          </div>
        )}
        <input type="hidden" name="orden" value={item?.orden ?? 99} />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={item?.activo ?? true} className="size-4 accent-tinta" /> Activa</label>
        <Boton variante={item ? "secundario" : "primario"} disabled={enviando}>{item ? "Guardar" : "Agregar"}</Boton>
      </div>
      <Resultado e={e} />
    </form>
  );
}

export function FormOpciones({ v }: { v: { negativo: boolean; meses: number; formato: string; conPrecio: boolean } }) {
  const [e, accion, enviando] = useActionState(accionOpciones, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Avisar piezas sin movimiento hace (meses)" htmlFor="meses">
          <input id="meses" name="meses" className="campo" inputMode="numeric" defaultValue={v.meses} />
        </Campo>
        <Campo etiqueta="Formato de etiqueta por defecto" htmlFor="formato">
          <select id="formato" name="formato" className="campo" defaultValue={v.formato}>
            <option value="colita">Colgante «colita» 70 × 12 mm</option>
            <option value="adhesiva">Adhesiva 40 × 25 mm</option>
            <option value="a4">Hoja A4 (24 por hoja)</option>
          </select>
        </Campo>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="conPrecio" defaultChecked={v.conPrecio} className="size-4 accent-tinta" /> Imprimir el precio en las etiquetas</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="negativo" defaultChecked={v.negativo} className="size-4 accent-tinta" /> Permitir stock negativo en artículos por cantidad (las piezas únicas nunca)</label>
      <Resultado e={e} />
      <div><Boton disabled={enviando}>Guardar opciones</Boton></div>
    </form>
  );
}

export function QuitarDemo({ cantidad }: { cantidad: number }) {
  const [e, accion, enviando] = useActionState(accionQuitarDemo, undefined);
  return (
    <form action={accion} onSubmit={(ev) => !confirm("¿Quitar todos los datos de ejemplo? Lo real no se toca.") && ev.preventDefault()} className="flex flex-col gap-3">
      {cantidad > 0 ? <div><Boton variante="peligro" disabled={enviando}>Quitar los datos de ejemplo</Boton></div> : !e?.ok && <p className="text-sm text-gris">No quedan datos de ejemplo.</p>}
      <Resultado e={e} />
    </form>
  );
}

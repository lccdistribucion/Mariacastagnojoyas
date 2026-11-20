"use client";
import { enviar } from "@/components/envio";
import { useActionState, useState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { guardarFuentes, guardarLeyAccion, guardarParametros, traerHistorial, type Estado } from "./acciones";

function Resultado({ e }: { e: Estado }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}
const aTexto = (c: number | null | undefined) => (c == null ? "" : String(c / 100).replace(".", ","));
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type Parametros = {
  referencia: string;
  referencias: { codigo: string; nombre: string; venta: number | null }[];
  frecuencia: number;
  fuera: number;
  desde: string;
  hasta: string;
  dias: number[];
  umbral: number;
  oroBajo: number;
  leyesOro: { id: number; nombre: string }[];
  backupHora: string;
  backupConservar: number;
  backupCarpeta: string;
};

export function FormParametros({ v }: { v: Parametros }) {
  const [e, accion, enviando] = useActionState(guardarParametros, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo etiqueta="Dólar de referencia del negocio" htmlFor="referencia" ayuda="Con este dólar se pasa el oro a pesos y se valúa el stock.">
          <select id="referencia" name="referencia" defaultValue={v.referencia} className="campo">
            {v.referencias.map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.nombre}{r.venta ? ` (hoy $ ${r.venta.toLocaleString("es-AR")})` : ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Ley que se muestra como «oro bajo»" htmlFor="oroBajo" ayuda="Aparece en la barra de arriba.">
          <select id="oroBajo" name="oroBajo" defaultValue={v.oroBajo} className="campo">
            {v.leyesOro.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </Campo>
      </div>

      <div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-gris">Actualización automática</h3>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="En horario, cada (min)" htmlFor="frecuencia" ayuda="Entre 15 y 240.">
            <input id="frecuencia" name="frecuencia" className="campo" inputMode="numeric" defaultValue={v.frecuencia} required />
          </Campo>
          <Campo etiqueta="Fuera de horario, cada (min)" htmlFor="fuera" ayuda="Entre 60 y 1440.">
            <input id="fuera" name="fuera" className="campo" inputMode="numeric" defaultValue={v.fuera} required />
          </Campo>
          <Campo etiqueta="Horario desde" htmlFor="desde">
            <input id="desde" name="desde" type="time" className="campo" defaultValue={v.desde} required />
          </Campo>
          <Campo etiqueta="Horario hasta" htmlFor="hasta">
            <input id="hasta" name="hasta" type="time" className="campo" defaultValue={v.hasta} required />
          </Campo>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-tinta-suave">Días comerciales</legend>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d, i) => (
              <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-linea-fuerte bg-superficie px-3 has-[:checked]:border-tinta has-[:checked]:bg-champagne-suave/50">
                <input type="checkbox" name="dias" value={i + 1} defaultChecked={v.dias.includes(i + 1)} className="size-4 accent-tinta" />
                <span className="text-sm">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="Avisar si el dólar o el oro varían más de (%) en el día" htmlFor="umbral">
            <input id="umbral" name="umbral" className="campo" inputMode="decimal" defaultValue={aTexto(v.umbral)} required />
          </Campo>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-gris">Copia de seguridad diaria</h3>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta="Hora de la copia" htmlFor="backupHora" ayuda="Si la PC estaba apagada, la hace al encenderla.">
            <input id="backupHora" name="backupHora" type="time" className="campo" defaultValue={v.backupHora} required />
          </Campo>
          <Campo etiqueta="Copias diarias a conservar" htmlFor="backupConservar" ayuda="Las más viejas se reemplazan. Las manuales no se tocan.">
            <input id="backupConservar" name="backupConservar" className="campo" inputMode="numeric" defaultValue={v.backupConservar} required />
          </Campo>
          <Campo etiqueta="Carpeta adicional (opcional)" htmlFor="backupCarpeta" ayuda="Ej.: G:\Mi unidad\Copias joyería (Google Drive para PC).">
            <input id="backupCarpeta" name="backupCarpeta" className="campo" defaultValue={v.backupCarpeta} placeholder="Vacío = solo en la carpeta backups" />
          </Campo>
        </div>
      </div>
      <Resultado e={e} />
      <div><Boton disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</Boton></div>
    </form>
  );
}

export type FuenteInfo = { id: string; nombre: string; sitio: string; activo: boolean; codigos: string[]; gratis: boolean; requiereClave: boolean; limites: string };

export function FormFuentes({ fuentes }: { fuentes: FuenteInfo[] }) {
  const [lista, setLista] = useState(fuentes);
  const [e, accion, enviando] = useActionState(guardarFuentes, undefined);
  const mover = (i: number, d: -1 | 1) =>
    setLista((l) => {
      const c = [...l];
      [c[i], c[i + d]] = [c[i + d], c[i]];
      return c;
    });
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <input type="hidden" name="orden" value={JSON.stringify(lista.map((f) => ({ id: f.id, activo: f.activo })))} />
      <ol className="divide-y divide-linea rounded-lg border border-linea">
        {lista.map((f, i) => (
          <li key={f.id} className={`flex items-start gap-3 px-3 py-3 sm:px-4 ${f.activo ? "" : "opacity-55"}`}>
            <span className="mt-1 w-5 text-center text-xs text-gris">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={f.activo} onChange={(ev) => setLista((l) => l.map((x) => (x.id === f.id ? { ...x, activo: ev.target.checked } : x)))} className="size-4 accent-tinta" />
                <span className="font-medium">{f.nombre}</span>
                <span className="text-xs text-gris">{f.sitio}</span>
              </label>
              <p className="mt-1 text-xs text-gris">{f.codigos.join(" · ")}</p>
              <p className="text-xs text-gris">{f.gratis ? "Gratis" : "Paga"} · {f.requiereClave ? "requiere clave" : "sin clave"} · {f.limites}</p>
            </div>
            <div className="flex flex-col">
              <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="flex size-9 items-center justify-center rounded text-gris hover:bg-papel hover:text-tinta disabled:opacity-30" aria-label={`Subir ${f.nombre}`}>▲</button>
              <button type="button" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} className="flex size-9 items-center justify-center rounded text-gris hover:bg-papel hover:text-tinta disabled:opacity-30" aria-label={`Bajar ${f.nombre}`}>▼</button>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-gris">Para cada cotización se usa la primera fuente de la lista que la tenga; las siguientes son el respaldo.</p>
      <Resultado e={e} />
      <div><Boton disabled={enviando}>{enviando ? "Guardando…" : "Guardar fuentes"}</Boton></div>
    </form>
  );
}

export type LeyFila = {
  id?: number;
  nombre: string;
  metal: string;
  quilates: number | null;
  milesimos: number | null;
  ajusteVentaPct: number;
  ajusteCompraPct: number;
  precioManualGramo: number | null;
  activo: boolean;
  orden: number;
};

export function FormLey({ ley }: { ley?: LeyFila }) {
  const [e, accion, enviando] = useActionState(guardarLeyAccion, undefined);
  const [metal, setMetal] = useState(ley?.metal ?? "oro");
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      {ley?.id && <input type="hidden" name="id" value={ley.id} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Nombre" htmlFor={`n-${ley?.id ?? "nueva"}`}>
          <input id={`n-${ley?.id ?? "nueva"}`} name="nombre" className="campo" defaultValue={ley?.nombre} required placeholder="Oro 18k" />
        </Campo>
        <Campo etiqueta="Metal" htmlFor={`m-${ley?.id ?? "nueva"}`}>
          <select id={`m-${ley?.id ?? "nueva"}`} name="metal" className="campo" value={metal} onChange={(ev) => setMetal(ev.target.value)}>
            <option value="oro">Oro</option>
            <option value="plata">Plata</option>
            <option value="otro">Otro (precio manual)</option>
          </select>
        </Campo>
        {metal === "oro" && (
          <Campo etiqueta="Quilates" htmlFor={`q-${ley?.id ?? "nueva"}`} ayuda="Calcula la pureza sola.">
            <input id={`q-${ley?.id ?? "nueva"}`} name="quilates" className="campo" inputMode="numeric" defaultValue={ley?.quilates ?? ""} />
          </Campo>
        )}
        <Campo etiqueta="Pureza (milésimos)" htmlFor={`p-${ley?.id ?? "nueva"}`} ayuda={metal === "oro" ? "Vacío = según quilates." : "925 = plata 925."}>
          <input id={`p-${ley?.id ?? "nueva"}`} name="milesimos" className="campo" inputMode="numeric" defaultValue={ley?.milesimos ?? ""} />
        </Campo>
        <Campo etiqueta="Ajuste precio de venta (%)" htmlFor={`v-${ley?.id ?? "nueva"}`} ayuda="+10 = 10 % sobre mercado.">
          <input id={`v-${ley?.id ?? "nueva"}`} name="ajusteVenta" className="campo" inputMode="decimal" defaultValue={aTexto(ley?.ajusteVentaPct ?? 0)} />
        </Campo>
        <Campo etiqueta="Ajuste compra de usado (%)" htmlFor={`c-${ley?.id ?? "nueva"}`} ayuda="−20 = paga 20 % menos.">
          <input id={`c-${ley?.id ?? "nueva"}`} name="ajusteCompra" className="campo" inputMode="decimal" defaultValue={aTexto(ley?.ajusteCompraPct ?? 0)} />
        </Campo>
        <Campo etiqueta="Precio manual del gramo ($)" htmlFor={`pm-${ley?.id ?? "nueva"}`} ayuda={metal === "otro" ? "Obligatorio para otros metales." : "Opcional: reemplaza al automático."}>
          <input id={`pm-${ley?.id ?? "nueva"}`} name="precioManual" className="campo" inputMode="decimal" defaultValue={aTexto(ley?.precioManualGramo)} />
        </Campo>
        <Campo etiqueta="Orden" htmlFor={`o-${ley?.id ?? "nueva"}`}>
          <input id={`o-${ley?.id ?? "nueva"}`} name="orden" className="campo" inputMode="numeric" defaultValue={ley?.orden ?? 10} />
        </Campo>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" name="activo" defaultChecked={ley?.activo ?? true} className="size-4 accent-tinta" />
        <span className="text-sm">Activa (se muestra y se puede usar en las piezas)</span>
      </label>
      <Resultado e={e} />
      <div><Boton disabled={enviando}>{enviando ? "Guardando…" : ley?.id ? "Guardar ley" : "Agregar ley"}</Boton></div>
    </form>
  );
}

export function FormHistorial() {
  const [e, accion, enviando] = useActionState(traerHistorial, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Período" htmlFor="dias">
          <select id="dias" name="dias" className="campo" defaultValue="365">
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
            <option value="730">Últimos 2 años</option>
          </select>
        </Campo>
        <Boton variante="secundario" disabled={enviando}>{enviando ? "Trayendo… (puede tardar)" : "Traer historial"}</Boton>
      </div>
      <Resultado e={e} />
    </form>
  );
}

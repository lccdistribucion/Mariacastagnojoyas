"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo, clasesBoton } from "@/components/ui";
import { CONDICIONES_IVA } from "@/lib/identidad";
import { guardarCliente } from "./acciones";

export type InicialCliente = Partial<Record<"nombre" | "tipoDoc" | "documento" | "condicionIva" | "domicilio" | "localidad" | "provincia" | "telefono" | "whatsapp" | "email" | "cumpleanos" | "aniversario" | "talles" | "preferencias" | "notas", string | null>> & { id?: number };

export function FormularioCliente({ inicial = {} }: { inicial?: InicialCliente }) {
  const [e, accion, enviando] = useActionState(guardarCliente, undefined);
  const [tipoDoc, setTipoDoc] = useState(inicial.tipoDoc ?? "DNI");
  const [confirmar, setConfirmar] = useState(false);
  const v = (k: keyof InicialCliente) => (inicial[k] as string | null | undefined) ?? "";
  const bloque = (t: string, hijos: React.ReactNode) => (
    <fieldset className="rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:p-6">
      <legend className="sr-only">{t}</legend>
      <h2 className="font-medium">{t}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hijos}</div>
    </fieldset>
  );
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-5">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {bloque(
        "Datos",
        <>
          <div className="sm:col-span-2">
            <Campo etiqueta="Nombre y apellido (o razón social)" htmlFor="nombre">
              <input id="nombre" name="nombre" className="campo" defaultValue={v("nombre")} required maxLength={100} autoComplete="off" />
            </Campo>
          </div>
          <Campo etiqueta="Condición frente al IVA" htmlFor="condicionIva">
            <select id="condicionIva" name="condicionIva" className="campo" defaultValue={v("condicionIva") || "consumidor_final"}>
              {Object.entries(CONDICIONES_IVA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Campo>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Campo etiqueta="Documento" htmlFor="tipoDoc">
              <select id="tipoDoc" name="tipoDoc" className="campo" value={tipoDoc} onChange={(x) => setTipoDoc(x.target.value)}>
                <option value="DNI">DNI</option><option value="CUIT">CUIT</option><option value="CUIL">CUIL</option><option value="PAS">Pasaporte</option>
              </select>
            </Campo>
            <Campo etiqueta="Número" htmlFor="documento">
              <input id="documento" name="documento" className="campo" inputMode={tipoDoc === "PAS" ? "text" : "numeric"} defaultValue={v("documento")} placeholder={tipoDoc === "DNI" ? "30.123.456" : tipoDoc === "PAS" ? "" : "20-30123456-7"} />
            </Campo>
          </div>
          <Campo etiqueta="Cumpleaños" htmlFor="cumpleanos" ayuda="Si no sabés el año, poné cualquiera.">
            <input id="cumpleanos" name="cumpleanos" type="date" className="campo" defaultValue={v("cumpleanos")} />
          </Campo>
          <Campo etiqueta="Aniversario" htmlFor="aniversario">
            <input id="aniversario" name="aniversario" type="date" className="campo" defaultValue={v("aniversario")} />
          </Campo>
        </>,
      )}
      {bloque(
        "Contacto",
        <>
          <Campo etiqueta="WhatsApp" htmlFor="whatsapp" ayuda="Con código de área: 341 15 555-1234.">
            <input id="whatsapp" name="whatsapp" className="campo" inputMode="tel" defaultValue={v("whatsapp")} />
          </Campo>
          <Campo etiqueta="Otro teléfono" htmlFor="telefono">
            <input id="telefono" name="telefono" className="campo" inputMode="tel" defaultValue={v("telefono")} />
          </Campo>
          <Campo etiqueta="Email" htmlFor="email">
            <input id="email" name="email" type="email" className="campo" defaultValue={v("email")} />
          </Campo>
          <Campo etiqueta="Domicilio" htmlFor="domicilio">
            <input id="domicilio" name="domicilio" className="campo" defaultValue={v("domicilio")} />
          </Campo>
          <Campo etiqueta="Localidad" htmlFor="localidad">
            <input id="localidad" name="localidad" className="campo" defaultValue={v("localidad")} />
          </Campo>
          <Campo etiqueta="Provincia" htmlFor="provincia">
            <input id="provincia" name="provincia" className="campo" defaultValue={v("provincia") || (inicial.id ? "" : "Santa Fe")} />
          </Campo>
        </>,
      )}
      {bloque(
        "Gustos",
        <>
          <Campo etiqueta="Talles frecuentes" htmlFor="talles">
            <input id="talles" name="talles" className="campo" defaultValue={v("talles")} placeholder="Anillo 14 · pulsera 18 cm" />
          </Campo>
          <div className="sm:col-span-2">
            <Campo etiqueta="Preferencias" htmlFor="preferencias">
              <input id="preferencias" name="preferencias" className="campo" defaultValue={v("preferencias")} placeholder="Oro blanco, piezas delicadas, perlas…" />
            </Campo>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Campo etiqueta="Notas" htmlFor="notas">
              <textarea id="notas" name="notas" className="campo min-h-20" defaultValue={v("notas")} />
            </Campo>
          </div>
        </>,
      )}
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      {e?.parecidos && (
        <div className="rounded-lg border border-alerta/30 bg-alerta-suave p-4 text-sm">
          <p className="mb-2">¿Es alguno de estos?</p>
          <ul className="mb-3 flex flex-wrap gap-2">
            {e.parecidos.map((p) => <li key={p.id}><Link href={`/clientes/${p.id}`} className={clasesBoton("secundario")}>{p.nombre}</Link></li>)}
          </ul>
          <label className="flex items-center gap-2"><input type="checkbox" checked={confirmar} onChange={(x) => setConfirmar(x.target.checked)} className="size-4 accent-tinta" /> No, es otra persona: dar de alta igual</label>
        </div>
      )}
      <input type="hidden" name="confirmarDuplicado" value={confirmar ? "1" : ""} />
      <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-linea bg-papel/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Boton disabled={enviando} className="flex-1 sm:flex-none">{enviando ? "Guardando…" : inicial.id ? "Guardar cambios" : "Dar de alta"}</Boton>
        <Link href={inicial.id ? `/clientes/${inicial.id}` : "/clientes"} className={clasesBoton("fantasma")}>Cancelar</Link>
      </div>
    </form>
  );
}

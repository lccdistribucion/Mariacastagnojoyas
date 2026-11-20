"use client";
import Link from "next/link";
import { useActionState } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo, clasesBoton } from "@/components/ui";
import { CONDICIONES_IVA } from "@/lib/identidad";
import { RUBROS } from "@/lib/proveedores/rubros";
import { guardarProveedor } from "./acciones";

export type InicialProveedor = { id?: number; razonSocial?: string; nombreFantasia?: string | null; cuit?: string | null; condicionIva?: string; rubros?: string[]; contacto?: string | null; telefono?: string | null; whatsapp?: string | null; email?: string | null; domicilio?: string | null; condicionesPago?: string | null; diasPago?: number; notas?: string | null };

export function FormularioProveedor({ inicial = {} }: { inicial?: InicialProveedor }) {
  const [e, accion, enviando] = useActionState(guardarProveedor, undefined);
  const v = (k: keyof InicialProveedor) => String(inicial[k] ?? "");
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-5">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <fieldset className="grid gap-4 rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <legend className="sr-only">Datos</legend>
        <div className="sm:col-span-2"><Campo etiqueta="Razón social o nombre" htmlFor="razonSocial"><input id="razonSocial" name="razonSocial" className="campo" defaultValue={v("razonSocial")} required /></Campo></div>
        <Campo etiqueta="Nombre de fantasía" htmlFor="nombreFantasia"><input id="nombreFantasia" name="nombreFantasia" className="campo" defaultValue={v("nombreFantasia")} /></Campo>
        <Campo etiqueta="CUIT" htmlFor="cuit" ayuda="Se valida el dígito verificador."><input id="cuit" name="cuit" className="campo" inputMode="numeric" defaultValue={v("cuit")} placeholder="30-12345678-9" /></Campo>
        <Campo etiqueta="Condición frente al IVA" htmlFor="condicionIva">
          <select id="condicionIva" name="condicionIva" className="campo" defaultValue={v("condicionIva") || "responsable_inscripto"}>{Object.entries(CONDICIONES_IVA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </Campo>
        <Campo etiqueta="Días de pago habituales" htmlFor="diasPago" ayuda="Para calcular el vencimiento de las facturas."><input id="diasPago" name="diasPago" className="campo" inputMode="numeric" defaultValue={inicial.diasPago ?? 0} /></Campo>
        <fieldset className="sm:col-span-2 lg:col-span-3">
          <legend className="mb-2 text-sm font-medium text-tinta-suave">Rubros</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(RUBROS).map(([k, t]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-linea-fuerte bg-superficie px-3 text-sm has-[:checked]:border-tinta has-[:checked]:bg-champagne-suave/50">
                <input type="checkbox" name="rubros" value={k} defaultChecked={inicial.rubros?.includes(k)} className="size-4 accent-tinta" /> {t}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      <fieldset className="grid gap-4 rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <legend className="sr-only">Contacto</legend>
        <Campo etiqueta="Persona de contacto" htmlFor="contacto"><input id="contacto" name="contacto" className="campo" defaultValue={v("contacto")} /></Campo>
        <Campo etiqueta="WhatsApp" htmlFor="whatsapp"><input id="whatsapp" name="whatsapp" className="campo" inputMode="tel" defaultValue={v("whatsapp")} /></Campo>
        <Campo etiqueta="Teléfono" htmlFor="telefono"><input id="telefono" name="telefono" className="campo" inputMode="tel" defaultValue={v("telefono")} /></Campo>
        <Campo etiqueta="Email" htmlFor="email"><input id="email" name="email" type="email" className="campo" defaultValue={v("email")} /></Campo>
        <Campo etiqueta="Domicilio" htmlFor="domicilio"><input id="domicilio" name="domicilio" className="campo" defaultValue={v("domicilio")} /></Campo>
        <Campo etiqueta="Condiciones de pago" htmlFor="condicionesPago"><input id="condicionesPago" name="condicionesPago" className="campo" defaultValue={v("condicionesPago")} placeholder="30 días, 10 % contado…" /></Campo>
        <div className="sm:col-span-2 lg:col-span-3"><Campo etiqueta="Notas" htmlFor="notas"><textarea id="notas" name="notas" className="campo min-h-20" defaultValue={v("notas")} /></Campo></div>
      </fieldset>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      <div className="flex gap-2">
        <Boton disabled={enviando}>{enviando ? "Guardando…" : inicial.id ? "Guardar cambios" : "Dar de alta"}</Boton>
        <Link href={inicial.id ? `/proveedores/${inicial.id}` : "/proveedores"} className={clasesBoton("fantasma")}>Cancelar</Link>
      </div>
    </form>
  );
}

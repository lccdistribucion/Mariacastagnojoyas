"use client";
import { enviar } from "@/components/envio";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, clasesBoton } from "@/components/ui";
import { PERMISOS, PERMISOS_DELEGABLES, ROLES, type Rol } from "@/lib/permisos";
import { guardarUsuario } from "./acciones";
import { ClaveTemporal } from "./clave-temporal";

type Inicial = {
  id?: number;
  usuario?: string;
  nombre?: string;
  rol?: Rol;
  descuentoMaxPct?: number | null;
  comisionPct?: number;
  permisos?: string[];
};

const aTexto = (c: number | null | undefined) => (c == null ? "" : String(c / 100).replace(".", ","));

export function FormularioUsuario({ inicial = {}, descuentoGeneral, esUnoMismo }: { inicial?: Inicial; descuentoGeneral: number; esUnoMismo?: boolean }) {
  const [estado, accion, enviando] = useActionState(guardarUsuario, undefined);
  const [rol, setRol] = useState<Rol>(inicial.rol ?? "usuario");

  if (estado?.claveTemporal && !inicial.id)
    return (
      <div className="flex flex-col gap-5">
        <ClaveTemporal clave={estado.claveTemporal} titulo="Usuario creado" />
        <div className="flex flex-wrap gap-2">
          <Link href="/usuarios" className={clasesBoton("primario")}>Volver a usuarios</Link>
          <Link href={`/usuarios/${estado.id}`} className={clasesBoton("secundario")}>Ver el usuario</Link>
        </div>
      </div>
    );

  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-6">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo etiqueta="Nombre y apellido" htmlFor="nombre">
          <input id="nombre" name="nombre" className="campo" defaultValue={inicial.nombre} required maxLength={80} />
        </Campo>
        <Campo etiqueta="Usuario (para ingresar)" htmlFor="usuario" ayuda="En minúsculas, sin espacios. Ej.: lucia">
          <input id="usuario" name="usuario" className="campo" defaultValue={inicial.usuario} required autoCapitalize="none" autoCorrect="off" spellCheck={false} pattern="[a-zA-Z0-9._\-]{3,30}" />
        </Campo>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-tinta-suave">Rol</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["usuario", "admin"] as Rol[]).map((r) => (
            <label key={r} className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${rol === r ? "border-tinta bg-champagne-suave/40" : "border-linea-fuerte bg-superficie"} ${esUnoMismo ? "cursor-not-allowed opacity-60" : ""}`}>
              <input type="radio" name="rol" value={r} checked={rol === r} onChange={() => setRol(r)} disabled={esUnoMismo} className="mt-1 accent-tinta" />
              <span>
                <span className="block text-sm font-medium">{ROLES[r]}</span>
                <span className="mt-0.5 block text-xs text-gris">
                  {r === "admin" ? "Acceso total: costos, precios, cotizaciones, tesorería, usuarios y auditoría." : "Vende, cobra, toma señas, reparaciones y pedidos. No ve costos ni tesorería."}
                </span>
              </span>
            </label>
          ))}
        </div>
        {esUnoMismo && <input type="hidden" name="rol" value={rol} />}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo etiqueta="Descuento máximo sin autorización (%)" htmlFor="descuentoMax" ayuda={`Vacío = el general (${aTexto(descuentoGeneral)} %). Por encima, pide la clave de un administrador.`}>
          <input id="descuentoMax" name="descuentoMax" className="campo" inputMode="decimal" defaultValue={aTexto(inicial.descuentoMaxPct)} placeholder={`${aTexto(descuentoGeneral)} (general)`} />
        </Campo>
        <Campo etiqueta="Comisión sobre ventas (%)" htmlFor="comision" ayuda="Se usa en el módulo de Ventas.">
          <input id="comision" name="comision" className="campo" inputMode="decimal" defaultValue={aTexto(inicial.comisionPct ?? 0)} />
        </Campo>
      </div>

      {rol === "usuario" && (
        <fieldset className="rounded-lg border border-linea bg-papel/60 p-4">
          <legend className="px-1 text-sm font-medium text-tinta-suave">Permisos especiales</legend>
          <p className="mb-3 text-xs text-gris">Por defecto un usuario no tiene ninguno. Marcá solo lo que esta persona necesita.</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {PERMISOS_DELEGABLES.map((p) => (
              <label key={p} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-superficie">
                <input type="checkbox" name="permisos" value={p} defaultChecked={inicial.permisos?.includes(p)} className="size-4 accent-tinta" />
                <span className="text-sm">{PERMISOS[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado?.ok && inicial.id && <Aviso tono="ok">{estado.ok}</Aviso>}

      <div className="flex flex-wrap gap-2">
        <Boton type="submit" disabled={enviando}>{enviando ? "Guardando…" : inicial.id ? "Guardar cambios" : "Crear usuario"}</Boton>
        <Link href="/usuarios" className={clasesBoton("fantasma")}>Cancelar</Link>
      </div>
    </form>
  );
}

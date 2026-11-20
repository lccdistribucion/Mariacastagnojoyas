"use client";
import { enviar } from "@/components/envio";
import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { DESTINOS_SALIDA, ESTADOS, ESTADOS_MANUALES, MOTIVOS_AJUSTE } from "@/lib/stock/tipos";
import { accionAjuste, accionEstado, accionSalida, type Estado } from "../acciones";

function Resultado({ e }: { e: Estado }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}

function Bloque({ titulo, children, abierto }: { titulo: string; children: React.ReactNode; abierto?: boolean }) {
  return (
    <details className="group rounded-xl border border-linea bg-superficie shadow-suave" open={abierto}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-medium">
        {titulo} <span className="text-gris transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="border-t border-linea px-4 py-4">{children}</div>
    </details>
  );
}

export function PanelAcciones(p: {
  id: number;
  tipo: string;
  estado: string;
  ubicacionId: number | null;
  ubicaciones: { id: number; nombre: string }[];
  puedeAjustar: boolean;
  usuario: string;
}) {
  const [eSalida, aSalida, pSalida] = useActionState(accionSalida, undefined);
  const [eEstado, aEstado, pEstado] = useActionState(accionEstado, undefined);
  const [eAjuste, aAjuste, pAjuste] = useActionState(accionAjuste, undefined);
  const vuelve = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const manual = ESTADOS_MANUALES.includes(p.estado as never);

  return (
    <div className="flex flex-col gap-3">
      {p.tipo === "unica" && p.estado === "disponible" && (
        <Bloque titulo="Retirar del local (prueba, feria…)">
          <form onSubmit={enviar(aSalida)} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Para" htmlFor="destino">
                <select id="destino" name="destino" className="campo">{Object.entries(DESTINOS_SALIDA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              </Campo>
              <Campo etiqueta="Vuelve el" htmlFor="vuelve">
                <input id="vuelve" name="vuelve" type="date" className="campo" defaultValue={vuelve} required />
              </Campo>
            </div>
            <Campo etiqueta="Cliente, feria o lugar" htmlFor="detalle">
              <input id="detalle" name="detalle" className="campo" required placeholder="Ej.: Clienta Laura Gómez (se la prueba en su casa)" />
            </Campo>
            <Campo etiqueta="Responsable" htmlFor="responsable">
              <input id="responsable" name="responsable" className="campo" defaultValue={p.usuario} />
            </Campo>
            <Resultado e={eSalida} />
            <div><Boton disabled={pSalida}>Registrar salida</Boton></div>
          </form>
        </Bloque>
      )}

      {manual && (
        <Bloque titulo="Estado y ubicación">
          <form onSubmit={enviar(aEstado)} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Estado" htmlFor="estado">
                <select id="estado" name="estado" className="campo" defaultValue={p.estado}>
                  {ESTADOS_MANUALES.map((k) => <option key={k} value={k}>{ESTADOS[k]}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Ubicación" htmlFor="ubicacionId">
                <select id="ubicacionId" name="ubicacionId" className="campo" defaultValue={p.ubicacionId ?? ""}>
                  <option value="">—</option>
                  {p.ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Nota (opcional)" htmlFor="nota">
              <input id="nota" name="nota" className="campo" placeholder="Ej.: la llevó el taller Ríos para ajustar talle" />
            </Campo>
            <Resultado e={eEstado} />
            <div><Boton disabled={pEstado}>Guardar</Boton></div>
          </form>
        </Bloque>
      )}

      {p.estado !== "vendido" && (
        <Bloque titulo={p.tipo === "unica" ? (p.estado === "baja" ? "Volver a poner en stock" : "Dar de baja (rotura, pérdida…)") : "Ajustar cantidad"}>
          <form onSubmit={enviar(aAjuste)} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Motivo" htmlFor="motivo">
                <select id="motivo" name="motivo" className="campo" defaultValue={p.estado === "baja" ? "sobrante" : "rotura"}>
                  {Object.entries(MOTIVOS_AJUSTE)
                    .filter(([k]) => p.tipo !== "unica" || (p.estado === "baja" ? k === "sobrante" : k !== "sobrante"))
                    .map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </Campo>
              {p.tipo !== "unica" && (
                <div className="grid grid-cols-2 gap-2">
                  <Campo etiqueta="Unidades" htmlFor="delta">
                    <input id="delta" name="delta" className="campo" inputMode="numeric" required defaultValue="1" />
                  </Campo>
                  <Campo etiqueta="Operación" htmlFor="sentido">
                    <select id="sentido" name="sentido" className="campo"><option value="restar">Restar</option><option value="sumar">Sumar</option></select>
                  </Campo>
                </div>
              )}
            </div>
            <Campo etiqueta="Explicación (obligatoria)" htmlFor="detalleAjuste">
              <input id="detalleAjuste" name="detalle" className="campo" required minLength={3} placeholder="Qué pasó" />
            </Campo>
            {!p.puedeAjustar && (
              <div className="rounded-lg border border-champagne/40 bg-champagne-suave/40 p-3">
                <p className="mb-3 text-sm">Hace falta la autorización de un administrador:</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Usuario del administrador" htmlFor="adminUsuario">
                    <input id="adminUsuario" name="adminUsuario" className="campo" autoComplete="off" autoCapitalize="none" required />
                  </Campo>
                  <Campo etiqueta="Clave del administrador" htmlFor="adminClave">
                    <input id="adminClave" name="adminClave" type="password" className="campo" autoComplete="off" required />
                  </Campo>
                </div>
              </div>
            )}
            <Resultado e={eAjuste} />
            <div><Boton variante={p.tipo === "unica" && p.estado !== "baja" ? "peligro" : "primario"} disabled={pAjuste}>Registrar ajuste</Boton></div>
          </form>
        </Bloque>
      )}
    </div>
  );
}

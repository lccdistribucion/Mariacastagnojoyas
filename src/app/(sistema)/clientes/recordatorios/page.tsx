import Link from "next/link";
import { clasesBoton, Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { proximosEventos, saldosPendientes } from "@/lib/clientes/recordatorios";
import { numero } from "@/lib/formato";

export const metadata = { title: "Recordatorios" };
const cuando = (d: number) => (d === 0 ? "¡Hoy!" : d === 1 ? "Mañana" : `En ${d} días`);

export default async function Recordatorios() {
  const u = await requiereUsuario();
  const veSaldos = u.permisos.has("ver_tesoreria") || u.permisos.has("configurar_sistema");
  const [eventos, saldos] = await Promise.all([proximosEventos(30), veSaldos ? saldosPendientes() : Promise.resolve([])]);
  return (
    <>
      <Encabezado titulo="Recordatorios" bajada={`Cumpleaños y aniversarios de los próximos 30 días${veSaldos ? " y saldos pendientes" : ""}. El botón abre WhatsApp con el mensaje escrito: lo revisás y tocás Enviar.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-4 font-medium">Cumpleaños y aniversarios</h2>
          {eventos.length === 0 ? (
            <Vacio>No hay cumpleaños ni aniversarios en los próximos 30 días.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {eventos.map((e) => (
                <li key={`${e.clienteId}-${e.tipo}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-2xl" aria-hidden>{e.tipo === "cumpleanos" ? "🎂" : "💍"}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/clientes/${e.clienteId}`} className="font-medium hover:underline">{e.nombre}</Link>
                    <span className="block text-xs text-gris">
                      {e.tipo === "cumpleanos" ? "Cumpleaños" : "Aniversario"} · {e.fecha.slice(8, 10)}/{e.fecha.slice(5, 7)} · <span className={e.dias <= 1 ? "font-semibold text-champagne" : ""}>{cuando(e.dias)}</span>
                      {e.anios ? ` · ${e.tipo === "cumpleanos" ? "cumple" : "cumplen"} ${e.anios}` : ""}
                    </span>
                  </span>
                  {e.enlace ? <a href={e.enlace} target="_blank" rel="noopener" className={clasesBoton("secundario")}>WhatsApp</a> : <span className="text-xs text-gris">Sin WhatsApp</span>}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        {veSaldos && (
          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-4 font-medium">Saldos pendientes</h2>
            {saldos.length === 0 ? (
              <Vacio>Ningún cliente debe.</Vacio>
            ) : (
              <ul className="divide-y divide-linea">
                {saldos.map((s) => (
                  <li key={s.clienteId} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <Link href={`/clientes/${s.clienteId}`} className="font-medium hover:underline">{s.nombre}</Link>
                      <span className="block text-xs text-gris">Debe $ {numero(s.saldo / 100, 0)}{s.vencido > 0 && <span className="text-error"> · vencido $ {numero(s.vencido / 100, 0)}</span>}</span>
                    </span>
                    {s.enlace ? <a href={s.enlace} target="_blank" rel="noopener" className={clasesBoton("secundario")}>Recordar</a> : <span className="text-xs text-gris">Sin WhatsApp</span>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
      </div>
    </>
  );
}

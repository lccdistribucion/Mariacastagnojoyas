import Link from "next/link";
import { BotonLink, clasesBoton, Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { IconoFlecha, IconoMas } from "@/components/iconos";
import { requiereUsuario } from "@/lib/auth/sesion";
import { listarClientes } from "@/lib/clientes/clientes";
import { numero } from "@/lib/formato";

export const metadata = { title: "Clientes" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; saldo?: string; inactivos?: string; pagina?: string }> }) {
  await requiereUsuario();
  const sp = await searchParams;
  const r = await listarClientes({ q: sp.q, conSaldo: sp.saldo === "1", inactivos: sp.inactivos === "1", pagina: Number(sp.pagina) || 1 });
  const q = (extra: Record<string, string | number>) => new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.saldo ? { saldo: sp.saldo } : {}), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString();
  return (
    <>
      <Encabezado
        titulo="Clientes"
        bajada={`${numero(r.total, 0)} ${r.total === 1 ? "cliente" : "clientes"}${sp.q ? ` que coinciden con «${sp.q}»` : ""}.`}
        acciones={<BotonLink href={`/clientes/nuevo${sp.q && !/\d/.test(sp.q) ? `?nombre=${encodeURIComponent(sp.q)}` : ""}`}><IconoMas className="size-4" /> Nuevo cliente</BotonLink>}
      />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="search" name="q" defaultValue={sp.q} placeholder="Nombre, DNI/CUIT, WhatsApp, email…" className="campo min-w-0 flex-1" aria-label="Buscar cliente" autoComplete="off" />
          <button className={clasesBoton("primario")}>Buscar</button>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="saldo" value="1" defaultChecked={sp.saldo === "1"} className="size-4 accent-tinta" /> Con saldo</label>
          {(sp.q || sp.saldo) && <Link href="/clientes" className={clasesBoton("fantasma")}>Limpiar</Link>}
        </form>
      </Tarjeta>
      <Tarjeta>
        {r.filas.length === 0 ? (
          <Vacio>
            No hay clientes{sp.q ? ` con «${sp.q}»` : ""}. {sp.q && <Link href={`/clientes/nuevo?nombre=${encodeURIComponent(sp.q)}`} className="underline">Darlo de alta</Link>}
          </Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {r.filas.map(({ c, saldo }) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className={`flex items-center gap-3 px-4 py-3.5 hover:bg-papel/60 sm:px-5 ${c.activo ? "" : "opacity-60"}`}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne-suave text-sm font-semibold text-[#7a6340]">{c.nombre.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nombre}{c.esDemo ? <span className="ml-2 text-[0.65rem] tracking-wide text-gris uppercase">ejemplo</span> : null}</span>
                    <span className="block truncate text-xs text-gris">{[c.documento && `${c.tipoDoc} ${c.documento}`, c.whatsapp && `+${c.whatsapp}`, c.localidad].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
                  </span>
                  {saldo !== 0 && <span className={`text-sm whitespace-nowrap tabular-nums ${saldo > 0 ? "font-semibold text-error" : "text-ok"}`}>{saldo > 0 ? `Debe ${$(saldo)}` : `A favor ${$(-saldo)}`}</span>}
                  <IconoFlecha className="size-4 shrink-0 text-gris" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {r.paginas > 1 && (
        <div className="mt-4 flex justify-between text-sm">
          {r.pagina > 1 ? <Link href={`/clientes?${q({ pagina: r.pagina - 1 })}`} className={clasesBoton("secundario")}>← Anteriores</Link> : <span />}
          <span className="self-center text-gris">Página {r.pagina} de {r.paginas}</span>
          {r.pagina < r.paginas ? <Link href={`/clientes?${q({ pagina: r.pagina + 1 })}`} className={clasesBoton("secundario")}>Siguientes →</Link> : <span />}
        </div>
      )}
    </>
  );
}

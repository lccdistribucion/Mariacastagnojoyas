import Link from "next/link";
import { BotonLink, clasesBoton, Encabezado, Tarjeta, Vacio } from "@/components/ui";
import { IconoFlecha, IconoMas } from "@/components/iconos";
import { listarProveedores, RUBROS } from "@/lib/proveedores/proveedores";
import { saldoTexto } from "@/lib/proveedores/vista";

export const metadata = { title: "Proveedores" };

export default async function Proveedores({ searchParams }: { searchParams: Promise<{ q?: string; rubro?: string; saldo?: string }> }) {
  const sp = await searchParams;
  const lista = await listarProveedores({ q: sp.q, rubro: sp.rubro, conSaldo: sp.saldo === "1" });
  return (
    <>
      <Encabezado
        titulo="Proveedores"
        bajada="Fabricantes, mayoristas, artesanos, talleres y revendedores, con su cuenta corriente por moneda."
        acciones={
          <>
            <BotonLink href="/proveedores/compras/nueva"><IconoMas className="size-4" /> Cargar compra</BotonLink>
            <BotonLink href="/proveedores/nuevo" variante="secundario">Nuevo proveedor</BotonLink>
          </>
        }
      />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="search" name="q" defaultValue={sp.q} placeholder="Nombre, contacto, CUIT…" className="campo min-w-0 flex-1" aria-label="Buscar proveedor" />
          <select name="rubro" defaultValue={sp.rubro ?? ""} className="campo w-auto" aria-label="Rubro">
            <option value="">Todos los rubros</option>
            {Object.entries(RUBROS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="saldo" value="1" defaultChecked={sp.saldo === "1"} className="size-4 accent-tinta" /> Con saldo</label>
          <button className={clasesBoton("primario")}>Buscar</button>
        </form>
      </Tarjeta>
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>No hay proveedores. <Link href="/proveedores/nuevo" className="underline">Dar de alta el primero</Link>.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {lista.map((p) => (
              <li key={p.id}>
                <Link href={`/proveedores/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-papel/60 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.razonSocial}</span>
                    <span className="block truncate text-xs text-gris">{p.rubros.map((r) => RUBROS[r]?.split(" (")[0]).join(" · ")}{p.contacto ? ` · ${p.contacto}` : ""}{p.consignadas ? ` · ${p.consignadas} piezas en consignación` : ""}</span>
                  </span>
                  {Object.keys(p.saldos).length > 0 && <span className="text-right text-sm whitespace-nowrap tabular-nums">{saldoTexto(p.saldos)}</span>}
                  <IconoFlecha className="size-4 shrink-0 text-gris" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

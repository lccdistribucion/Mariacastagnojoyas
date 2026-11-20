import Link from "next/link";
import { BotonLink, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { IconoMas } from "@/components/iconos";
import { fecha } from "@/lib/formato";
import { listarCompras, TIPOS_COMPROBANTE } from "@/lib/proveedores/compras";
import { importe } from "@/lib/proveedores/vista";

export const metadata = { title: "Compras" };

export default async function Compras({ searchParams }: { searchParams: Promise<{ anuladas?: string }> }) {
  const sp = await searchParams;
  const lista = await listarCompras({ incluirAnuladas: sp.anuladas === "1" });
  return (
    <>
      <Encabezado
        titulo="Compras"
        bajada="Facturas y remitos de proveedores. Al cargarlas se actualizan el stock, los costos y la deuda."
        acciones={<BotonLink href="/proveedores/compras/nueva"><IconoMas className="size-4" /> Cargar compra</BotonLink>}
      />
      <p className="mb-3 text-sm"><Link href={sp.anuladas === "1" ? "/proveedores/compras" : "/proveedores/compras?anuladas=1"} className="text-gris underline underline-offset-2">{sp.anuladas === "1" ? "Ocultar anuladas" : "Ver también las anuladas"}</Link></p>
      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio>Todavía no se cargó ninguna compra.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {lista.map(({ c, proveedor }) => (
              <li key={c.id}>
                <Link href={`/proveedores/compras/${c.id}`} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-papel/60 sm:px-5 ${c.anulada ? "opacity-60" : ""}`}>
                  <span className="min-w-0">
                    <span className="block font-medium">{proveedor}</span>
                    <span className="block text-xs text-gris">{fecha(c.fecha)} · {TIPOS_COMPROBANTE[c.tipoComprobante as keyof typeof TIPOS_COMPROBANTE]}{c.numero != null ? ` ${c.numero}` : ""} · {c.condicion === "contado" ? "contado" : "cuenta corriente"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {c.anulada && <Etiqueta tono="error">Anulada</Etiqueta>}
                    <span className="font-medium tabular-nums">{importe(c.total, c.moneda)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

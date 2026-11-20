import Link from "next/link";
import { clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { fecha, finDelDia, hoyIso, inicioDelDia, numero } from "@/lib/formato";
import { claseDe, NOMBRE_TIPO, numeroComprobante } from "@/lib/facturacion/calculo";
import { listarComprobantes } from "@/lib/facturacion/emision";

export const metadata = { title: "Facturación" };
const $ = (c: number) => `$ ${numero(c / 100, 2)}`;

export default async function Comprobantes({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; tipo?: string; q?: string }> }) {
  const sp = await searchParams;
  const desde = sp.desde ?? `${hoyIso().slice(0, 8)}01`;
  const hasta = sp.hasta ?? hoyIso();
  const filas = await listarComprobantes({ desde: inicioDelDia(desde), hasta: finDelDia(hasta), estado: "autorizado", tipo: Number(sp.tipo) || undefined, texto: sp.q });
  const neto = filas.reduce((s, c) => s + (claseDe(c.tipo) === "nota_credito" ? -c.total : c.total), 0);
  return (
    <>
      <Encabezado titulo="Comprobantes electrónicos" bajada={`${filas.length} autorizados del ${desde.split("-").reverse().join("/")} al ${hasta.split("-").reverse().join("/")} · total ${$(neto)} (las notas de crédito restan)`} />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-gris">Desde<input type="date" name="desde" defaultValue={desde} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Hasta<input type="date" name="hasta" defaultValue={hasta} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Tipo<select name="tipo" defaultValue={sp.tipo ?? ""} className="campo"><option value="">Todos</option>{Object.entries(NOMBRE_TIPO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Cliente o documento<input type="search" name="q" defaultValue={sp.q} className="campo" /></label>
          <div className="flex items-end"><button className={clasesBoton("primario", "w-full")}>Filtrar</button></div>
        </form>
      </Tarjeta>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay comprobantes en esas fechas.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">{NOMBRE_TIPO[c.tipo]} {numeroComprobante(c.puntoVenta, c.numero)}{c.ambiente !== "produccion" && <Etiqueta>{c.ambiente === "simulado" ? "Simulada" : "Homologación"}</Etiqueta>}</span>
                  <span className="block text-xs text-gris">{fecha(c.fecha)} · {c.receptor}{c.docTipo !== 99 ? ` · ${c.docNro}` : ""} · CAE {c.cae}</span>
                </span>
                <span className={`tabular-nums ${claseDe(c.tipo) === "nota_credito" ? "text-error" : ""}`}>{claseDe(c.tipo) === "nota_credito" ? "−" : ""}{$(c.total)}</span>
                <span className="flex gap-2">
                  <a href={`/documentos/factura/${c.id}`} target="_blank" className={clasesBoton("secundario", "min-h-9 px-3")}>PDF</a>
                  {c.ventaId && <Link href={`/ventas/${c.ventaId}`} className={clasesBoton("fantasma", "min-h-9 px-3")}>Venta</Link>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

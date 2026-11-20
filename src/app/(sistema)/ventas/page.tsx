import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, leyesMetal, usuarios } from "@/db";
import { IconoFlecha } from "@/components/iconos";
import { BotonLink, clasesBoton, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fechaHora, hoyIso, numero } from "@/lib/formato";
import { listarVentas } from "@/lib/ventas/consultas";
import { listarMedios } from "@/lib/ventas/medios";

export const metadata = { title: "Ventas" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;

type SP = { desde?: string; hasta?: string; vendedor?: string; medio?: string; ley?: string; q?: string; tipo?: string; anuladas?: string };

export default async function Ventas({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requiereUsuario();
  const sp = await searchParams;
  const verTodas = u.permisos.has("ver_ventas_de_todos");
  const verSinFacturar = u.permisos.has("ver_sin_facturar");
  const desde = sp.desde ?? hoyIso(new Date(Date.now() - 30 * 86400_000));
  const hasta = sp.hasta ?? hoyIso();
  const [filas, medios, leyes, vendedores] = await Promise.all([
    listarVentas({ desde, hasta, vendedorId: Number(sp.vendedor) || undefined, medioId: Number(sp.medio) || undefined, leyId: Number(sp.ley) || undefined, texto: sp.q, tipo: sp.tipo === "factura" || sp.tipo === "interno" ? sp.tipo : undefined, incluirAnuladas: sp.anuladas === "1" }, { usuarioId: u.id, verTodas, verSinFacturar }),
    listarMedios(false),
    db.select({ id: leyesMetal.id, nombre: leyesMetal.nombre }).from(leyesMetal).orderBy(asc(leyesMetal.orden)),
    verTodas ? db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.activo, true)) : Promise.resolve([]),
  ]);
  const validas = filas.filter((f) => !f.v.anulada);
  const total = validas.reduce((s, f) => s + f.v.total + f.v.recargos, 0);
  return (
    <>
      <Encabezado
        titulo="Ventas"
        bajada={`${numero(validas.length, 0)} ${validas.length === 1 ? "venta" : "ventas"} · ${$(total)}${verTodas ? "" : " (solo las tuyas)"}`}
        acciones={<BotonLink href="/mostrador">Nueva venta</BotonLink>}
      />
      <Tarjeta className="mb-5 p-3 sm:p-4">
        <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-gris">Desde<input type="date" name="desde" defaultValue={desde} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Hasta<input type="date" name="hasta" defaultValue={hasta} className="campo" /></label>
          <label className="flex flex-col gap-1 text-xs text-gris">Medio de pago
            <select name="medio" defaultValue={sp.medio ?? ""} className="campo"><option value="">Todos</option>{medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gris">Metal
            <select name="ley" defaultValue={sp.ley ?? ""} className="campo"><option value="">Todos</option>{leyes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select>
          </label>
          {verTodas && (
            <label className="flex flex-col gap-1 text-xs text-gris">Vendedor
              <select name="vendedor" defaultValue={sp.vendedor ?? ""} className="campo"><option value="">Todos</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select>
            </label>
          )}
          {verSinFacturar && (
            <label className="flex flex-col gap-1 text-xs text-gris">Comprobante
              <select name="tipo" defaultValue={sp.tipo ?? ""} className="campo"><option value="">Todos</option><option value="factura">Con factura</option><option value="interno">Sin facturar</option></select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-gris sm:col-span-2">Pieza<input type="search" name="q" defaultValue={sp.q} placeholder="Código o nombre de la pieza" className="campo" /></label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            <button className={clasesBoton("primario")}>Filtrar</button>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="anuladas" value="1" defaultChecked={sp.anuladas === "1"} className="size-4 accent-tinta" /> Incluir anuladas</label>
            <Link href="/ventas" className={clasesBoton("fantasma")}>Limpiar</Link>
          </div>
        </form>
      </Tarjeta>
      <Tarjeta>
        {!filas.length ? (
          <Vacio>No hay ventas en esas fechas. <Link href="/mostrador" className="underline">Ir al mostrador</Link></Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {filas.map(({ v, cliente, vendedor }) => (
              <li key={v.id}>
                <Link href={`/ventas/${v.id}`} className={`flex items-center gap-3 px-4 py-3.5 hover:bg-papel/60 sm:px-5 ${v.anulada ? "opacity-60" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      N.º {String(v.numero).padStart(6, "0")}
                      {v.anulada && <Etiqueta tono="error">Anulada</Etiqueta>}
                      {v.tipoComprobante === "interno" && <Etiqueta tono="champagne">Sin facturar</Etiqueta>}
                      {v.aCuentaCorriente > 0 && <Etiqueta tono="alerta">Cuenta corriente</Etiqueta>}
                    </span>
                    <span className="block truncate text-xs text-gris">{fechaHora(v.fecha)} · {cliente ?? "Consumidor final"}{verTodas ? ` · ${vendedor ?? "—"}` : ""}</span>
                  </span>
                  <span className={`text-sm font-medium whitespace-nowrap tabular-nums ${v.anulada ? "line-through" : ""}`}>{$(v.total + v.recargos)}</span>
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

import Link from "next/link";
import { eq } from "drizzle-orm";
import { clientes, db } from "@/db";
import { Aviso, Encabezado, Etiqueta, Tarjeta, Vacio } from "@/components/ui";
import { fecha, numero } from "@/lib/formato";
import { listarCajas, listarCategorias } from "@/lib/tesoreria/cajas";
import { ESTADOS_CHEQUE, listarCheques } from "@/lib/tesoreria/cheques";
import { AccionesCheque, FormRecibirCheque } from "./paneles";

export const metadata = { title: "Cheques" };
const $ = (c: number) => `$ ${numero(c / 100, 2)}`;
const TONO: Record<string, "neutro" | "ok" | "alerta" | "champagne" | "error"> = { en_cartera: "champagne", depositado: "ok", endosado: "neutro", rechazado: "error", emitido: "alerta", debitado: "ok", anulado: "neutro" };

const AVISOS: Record<string, string> = { depositar: "Cheque depositado: salió de la cartera y entró en el banco.", rechazar: "Rechazo registrado: la deuda volvió a quien entregó el cheque.", debitar: "Débito registrado: salió del banco." };

export default async function Cheques({ searchParams }: { searchParams: Promise<{ ver?: string; cliente?: string; todos?: string; aviso?: string }> }) {
  const sp = await searchParams;
  const propios = sp.ver === "propios";
  const todos = sp.todos === "1";
  const [filas, cajas, cats, cli] = await Promise.all([
    listarCheques({ tipo: propios ? "propio" : "tercero", estados: todos ? undefined : propios ? ["emitido"] : ["en_cartera"] }),
    listarCajas(),
    listarCategorias("ingreso"),
    Number(sp.cliente) ? db.select().from(clientes).where(eq(clientes.id, Number(sp.cliente))) : Promise.resolve([]),
  ]);
  const bancos = cajas.filter((c) => c.tipo === "banco" && c.moneda === "ARS").map((c) => ({ id: c.id, nombre: c.nombre }));
  const total = filas.filter((f) => ["en_cartera", "emitido"].includes(f.c.estado)).reduce((s, f) => s + f.c.importe, 0);
  const ahora = Date.now();
  const enlace = (v: string, t: string, on: boolean) => <Link href={v} className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm ${on ? "border-tinta bg-tinta text-white" : "border-linea-fuerte bg-superficie"}`}>{t}</Link>;
  return (
    <>
      <Encabezado titulo="Cheques" bajada={propios ? `Cheques propios emitidos a proveedores${todos ? "" : ` sin debitar: ${$(total)}`}. Se emiten al pagar a un proveedor.` : `Cheques de terceros${todos ? "" : ` en cartera: ${$(total)}`}. Se endosan al pagar a un proveedor (medio «Cheque»).`} />
      {sp.aviso && AVISOS[sp.aviso] && <div className="mb-5"><Aviso tono="ok">{AVISOS[sp.aviso]}</Aviso></div>}
      <div className="mb-4 flex flex-wrap gap-2">
        {enlace("/tesoreria/cheques", "De terceros (en cartera)", !propios && !todos)}
        {enlace("/tesoreria/cheques?ver=propios", "Propios (sin debitar)", propios && !todos)}
        {enlace(`/tesoreria/cheques?todos=1${propios ? "&ver=propios" : ""}`, "Ver todos", todos)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Tarjeta>
          {!filas.length ? (
            <Vacio>No hay cheques acá.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {filas.map(({ c, cliente, proveedor }) => (
                <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                    <span>
                      <span className="flex flex-wrap items-center gap-2 font-medium">N.º {c.numero} · {c.banco} <Etiqueta tono={TONO[c.estado]}>{ESTADOS_CHEQUE[c.estado]}</Etiqueta>{["en_cartera", "emitido"].includes(c.estado) && c.fechaPago.getTime() < ahora && <Etiqueta tono="alerta">Ya se puede {c.tipo === "tercero" ? "depositar" : "debitar"}</Etiqueta>}</span>
                      <span className="block text-xs text-gris">Paga el {fecha(c.fechaPago)}{c.librador ? ` · librador ${c.librador}` : ""}{cliente ? ` · de ${cliente}` : ""}{proveedor ? ` · ${c.tipo === "propio" ? "a" : "endosado a"} ${proveedor}` : ""}{c.notas ? ` · ${c.notas}` : ""}</span>
                    </span>
                    <span className="font-medium tabular-nums">{$(c.importe)}</span>
                  </div>
                  <AccionesCheque id={c.id} estado={c.estado} tipo={c.tipo} bancos={bancos} volver={`/tesoreria/cheques?${new URLSearchParams({ ...(propios ? { ver: "propios" } : {}), ...(todos ? { todos: "1" } : {}) }).toString()}`} />
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        {!propios && (
          <Tarjeta className="self-start p-5">
            <h2 className="mb-3 font-medium">Recibir un cheque</h2>
            <FormRecibirCheque categorias={cats.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre }))} cliente={cli[0] ? { id: cli[0].id, nombre: cli[0].nombre, documento: cli[0].documento } : null} />
          </Tarjeta>
        )}
      </div>
    </>
  );
}

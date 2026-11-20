import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Aviso, BotonLink, clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { db, leyesMetal, proveedores, usuarios } from "@/db";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { listarCategorias, listarListas, listarUbicaciones } from "@/lib/stock/catalogos";
import { contextoPrecios, conPrecio } from "@/lib/stock/consultas";
import { precioConLista } from "@/lib/stock/precios";
import { obtenerProducto } from "@/lib/stock/productos";
import { DESTINOS_SALIDA, ESTADOS, ORIGENES, TIPOS, TIPOS_MOVIMIENTO, type EstadoPieza } from "@/lib/stock/tipos";
import { gramos, TONO_ESTADO } from "@/lib/stock/vista";
import { accionDevolucion } from "../acciones";
import { Galeria } from "./galeria";
import { PanelAcciones } from "./panel-acciones";

export const metadata = { title: "Pieza" };
const $ = (c: number | null | undefined) => (c == null ? "—" : `$ ${numero(c / 100, 0)}`);

export default async function Ficha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const u = await requiereUsuario();
  const p = await obtenerProducto(Number((await params).id));
  if (!p) notFound();
  const { aviso } = await searchParams;
  const [ctx, cats, ubis, listas, gente] = await Promise.all([contextoPrecios(), listarCategorias(), listarUbicaciones(), listarListas(), db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios)]);
  const [ley] = p.leyId ? await db.select().from(leyesMetal).where(eq(leyesMetal.id, p.leyId)) : [];
  const [prov] = p.proveedorId ? await db.select().from(proveedores).where(eq(proveedores.id, p.proveedorId)) : [];
  // Los proveedores solo los ve quien tiene permiso.
  const nombreProveedor = u.permisos.has("ver_proveedores") ? (prov?.razonSocial ?? p.consignante) : null;
  const { precio, costo } = conPrecio({ p }, ctx);
  const verCostos = u.permisos.has("ver_costos");
  const persona = (id: number | null) => gente.find((g) => g.id === id)?.nombre ?? "Sistema";
  const ubic = (id: number | null) => ubis.find((x) => x.id === id)?.nombre ?? "—";
  const salidaAbierta = p.salidas.find((s) => !s.devueltaEn);
  const editable = u.permisos.has("cargar_productos") && p.estado !== "vendido" && p.estado !== "baja";

  const dato = (t: string, v: React.ReactNode) =>
    v == null || v === "" || v === "—" ? null : (
      <div className="flex justify-between gap-4 border-b border-linea py-2 text-sm last:border-0">
        <dt className="text-gris">{t}</dt>
        <dd className="text-right">{v}</dd>
      </div>
    );

  return (
    <>
      <Encabezado
        titulo={p.nombre}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tracking-wider">{p.codigo}</span>
            <Etiqueta tono={TONO_ESTADO[p.estado] ?? "neutro"}>{ESTADOS[p.estado as EstadoPieza] ?? p.estado}</Etiqueta>
            {p.esDemo && <Etiqueta>Ejemplo</Etiqueta>}
            {p.origen === "consignacion" && <Etiqueta tono="champagne">Consignación{nombreProveedor ? `: ${nombreProveedor}` : ""}</Etiqueta>}
          </span>
        }
        acciones={
          <>
            {p.estado === "disponible" && ["unica", "cantidad"].includes(p.tipo) && <BotonLink href={`/mostrador?pieza=${p.id}`}>Vender</BotonLink>}
            {editable && <BotonLink href={`/stock/${p.id}/editar`} variante="secundario">Editar</BotonLink>}
            <a href={`/stock/etiquetas/pdf?ids=${p.id}`} className={clasesBoton("secundario")}>Imprimir etiqueta</a>
          </>
        }
      />
      {aviso === "creada" && <div className="mb-5"><Aviso tono="ok">Pieza dada de alta. Agregale fotos e imprimí la etiqueta.</Aviso></div>}
      {aviso === "guardada" && <div className="mb-5"><Aviso tono="ok">Cambios guardados.</Aviso></div>}
      {salidaAbierta && (
        <div className="mb-5">
          <Aviso tono={salidaAbierta.devolucionEsperada.getTime() < Date.now() ? "error" : "alerta"}>
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Fuera del local: {DESTINOS_SALIDA[salidaAbierta.destino as keyof typeof DESTINOS_SALIDA]} — {salidaAbierta.detalle}. Vuelve el {fecha(salidaAbierta.devolucionEsperada)}
                {salidaAbierta.devolucionEsperada.getTime() < Date.now() ? " (atrasada)" : ""}.
              </span>
              <form action={accionDevolucion}>
                <input type="hidden" name="salidaId" value={salidaAbierta.id} />
                <button className={clasesBoton("primario")}>Volvió al local</button>
              </form>
            </span>
          </Aviso>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Galeria productoId={p.id} fotos={p.fotos.map((f) => ({ id: f.id, archivo: f.archivo }))} nombre={p.nombre} puedeEditar={u.permisos.has("cargar_productos")} />

        <div className="flex flex-col gap-5">
          <Tarjeta className="p-5">
            <p className="text-xs text-gris">Precio de hoy</p>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="titulo-serif text-4xl tabular-nums">{$(precio.vigente)}</span>
              {precio.oferta != null && <span className="text-gris line-through tabular-nums">{$(precio.lista)}</span>}
            </div>
            <p className="mt-1 text-xs text-gris">{precio.detalle}{p.monedaPrecio !== "ARS" && p.modoPrecio === "fijo" ? ` (${p.monedaPrecio} ${numero(p.precioLista / 100, 2)})` : ""}</p>
            {precio.vigente != null && listas.some((l) => l.activo && l.ajustePct !== 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {listas.filter((l) => l.activo).map((l) => (
                  <span key={l.id} className="rounded-lg border border-linea px-3 py-1.5 text-sm">
                    <span className="text-gris">{l.nombre}:</span> <span className="tabular-nums">{$(precioConLista(precio.vigente!, l.ajustePct))}</span>
                  </span>
                ))}
              </div>
            )}
            {verCostos && (
              <p className="mt-3 border-t border-linea pt-3 text-sm text-tinta-suave">
                {costo.total ? <>Costo {$(costo.enPesos)}</> : "Costo sin cargar"}
                {costo.enPesos && precio.vigente ? <> · margen {$(precio.vigente - costo.enPesos)} ({numero(((precio.vigente - costo.enPesos) / precio.vigente) * 100, 0)} %)</> : null}
                {p.monedaCosto !== "ARS" && <span className="text-gris"> · costo en {p.monedaCosto} {numero(costo.total / 100, 2)}</span>}
              </p>
            )}
          </Tarjeta>

          <Tarjeta className="px-5 py-2">
            <dl>
              {dato("Tipo", TIPOS[p.tipo as keyof typeof TIPOS])}
              {dato("Categoría", cats.find((c) => c.id === p.categoriaId)?.nombre)}
              {dato("Metal y ley", [ley?.nombre, p.metalDetalle].filter(Boolean).join(" · "))}
              {dato("Peso", [p.pesoBrutoMg != null && `bruto ${gramos(p.pesoBrutoMg)}`, p.pesoNetoMg != null && `neto ${gramos(p.pesoNetoMg)}`].filter(Boolean).join(" · "))}
              {dato("Medidas", p.medidas)}
              {dato("Talle", p.talle)}
              {dato("Colección", p.coleccion)}
              {dato("Diseñador / artesano", p.artesano)}
              {dato("Ubicación", ubic(p.ubicacionId))}
              {p.tipo !== "unica" && dato("Cantidad", <span className={p.stockMinimo && p.cantidad <= p.stockMinimo ? "font-semibold text-error" : ""}>{p.cantidad} u. {p.stockMinimo ? `(mínimo ${p.stockMinimo})` : ""}</span>)}
              {dato("Origen", ORIGENES[p.origen as keyof typeof ORIGENES])}
              {dato(p.origen === "consignacion" ? "Dueño" : "Proveedor", nombreProveedor && (prov ? <Link href={`/proveedores/${prov.id}`} className="underline underline-offset-2">{nombreProveedor}</Link> : nombreProveedor))}
              {dato("IVA", `${numero(p.ivaPct / 100, p.ivaPct % 100 ? 1 : 0)} %${p.tratamientoIva === "bienes_usados" ? " · bien usado" : p.tratamientoIva === "exento" ? " · exento" : ""}`)}
              {dato("Código de barras", p.codigoBarras)}
            </dl>
          </Tarjeta>

          {p.piedras.length > 0 && (
            <Tarjeta className="p-5">
              <h2 className="mb-2 font-medium">Piedras</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {p.piedras.map((x) => (
                  <li key={x.id}>
                    {x.cantidad} × {x.tipo}
                    {x.quilates ? ` · ${numero(x.quilates / 100, 2)} ct` : ""}
                    {x.calidad ? ` · ${x.calidad}` : ""}
                    {x.certificado ? <span className="text-gris"> · certificado {x.certificado}</span> : ""}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
          {(p.descripcion || p.notasInternas) && (
            <Tarjeta className="p-5 text-sm">
              {p.descripcion && <p className="whitespace-pre-line">{p.descripcion}</p>}
              {p.notasInternas && <p className="mt-2 whitespace-pre-line text-gris">Nota interna: {p.notasInternas}</p>}
            </Tarjeta>
          )}

          <PanelAcciones id={p.id} tipo={p.tipo} estado={p.estado} ubicacionId={p.ubicacionId} ubicaciones={ubis.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre }))} puedeAjustar={u.permisos.has("ajustar_stock")} usuario={u.nombre} />
        </div>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-4 font-medium">Historial de la pieza</h2>
          <ol className="divide-y divide-linea">
            {p.movimientos.map((m) => (
              <li key={m.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</span>
                  <span className="text-xs text-gris">{fechaHora(m.fecha)} · {persona(m.usuarioId)}</span>
                </div>
                <p className="text-tinta-suave">
                  {m.estadoAntes && m.estadoDespues && m.estadoAntes !== m.estadoDespues && `${ESTADOS[m.estadoAntes as EstadoPieza]} → ${ESTADOS[m.estadoDespues as EstadoPieza]}. `}
                  {m.tipo === "ubicacion" && `${ubic(m.ubicacionAntes)} → ${ubic(m.ubicacionDespues)}. `}
                  {p.tipo !== "unica" && m.cantidad !== 0 && `${m.cantidad > 0 ? "+" : ""}${m.cantidad} u. (queda ${m.stockResultante}). `}
                  {m.motivo}
                  {m.autorizadoPor && m.autorizadoPor !== m.usuarioId ? ` Autorizó: ${persona(m.autorizadoPor)}.` : ""}
                </p>
              </li>
            ))}
          </ol>
        </Tarjeta>
        <Tarjeta>
          <h2 className="border-b border-linea px-5 py-4 font-medium">Historial de precios</h2>
          <ol className="divide-y divide-linea">
            {p.precios.map((h) => (
              <li key={h.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {h.listaAntes != null && <span className="text-gris tabular-nums">{numero(h.listaAntes / 100, 0)} → </span>}
                    <span className="font-medium tabular-nums">{p.modoPrecio === "gramo" && !h.listaDespues ? "por gramo" : `${h.moneda === "ARS" ? "$" : h.moneda} ${numero((h.listaDespues ?? 0) / 100, 0)}`}</span>
                    {h.ofertaDespues != null && <span className="text-gris"> (oferta {numero(h.ofertaDespues / 100, 0)})</span>}
                  </span>
                  <span className="text-xs text-gris">{fechaHora(h.fecha)} · {persona(h.usuarioId)}</span>
                </div>
                <p className="text-xs text-gris">{h.motivo}</p>
              </li>
            ))}
          </ol>
          <p className="border-t border-linea px-5 py-3 text-xs text-gris">
            <Link href={`/auditoria?entidad=producto&texto=${encodeURIComponent(p.codigo)}`} className="underline underline-offset-2">Ver todos los cambios en Auditoría</Link>
          </p>
        </Tarjeta>
      </section>
    </>
  );
}

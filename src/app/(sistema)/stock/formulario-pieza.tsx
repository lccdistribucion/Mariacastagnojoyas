"use client";
import { enviar } from "@/components/envio";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Aviso, Boton, Campo, clasesBoton } from "@/components/ui";
import { numero } from "@/lib/formato";
import { precioPieza, costoPieza, type Cotizaciones } from "@/lib/stock/precios";
import { ALICUOTAS_IVA, MONEDAS, ORIGENES, TIPOS } from "@/lib/stock/tipos";
import { guardarPieza } from "./acciones";

type Opcion = { id: number; nombre: string };
type Ley = Opcion & { gramoVenta: number | null; metal: string };
type Piedra = { tipo: string; cantidad: number; quilates: number | null; calidad: string | null; certificado: string | null };

export type InicialPieza = {
  id?: number;
  codigo?: string;
  codigoBarras?: string | null;
  nombre?: string;
  tipo?: string;
  categoriaId?: number | null;
  coleccion?: string | null;
  artesano?: string | null;
  leyId?: number | null;
  metalDetalle?: string | null;
  pesoBrutoMg?: number | null;
  pesoNetoMg?: number | null;
  medidas?: string | null;
  talle?: string | null;
  descripcion?: string | null;
  notasInternas?: string | null;
  costoMetal?: number;
  costoManoObra?: number;
  costoPiedras?: number;
  costoOtros?: number;
  monedaCosto?: string;
  modoPrecio?: string;
  precioLista?: number;
  precioOferta?: number | null;
  monedaPrecio?: string;
  hechura?: number;
  ivaPct?: number;
  tratamientoIva?: string;
  origen?: string;
  consignante?: string | null;
  proveedorId?: number | null;
  ubicacionId?: number | null;
  cantidad?: number;
  stockMinimo?: number;
  piedras?: Piedra[];
};

const aTexto = (c: number | null | undefined, div = 100) => (c == null ? "" : String(c / div).replace(".", ","));
const leer = (t: string) => {
  let s = t.trim().replace(/\s|\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function FormularioPieza(props: {
  inicial?: InicialPieza;
  categorias: Opcion[];
  ubicaciones: Opcion[];
  leyes: Ley[];
  cot: Cotizaciones;
  verCostos: boolean;
  puedePrecios: boolean;
  colecciones: string[];
  artesanos: string[];
  proveedores: Opcion[];
}) {
  const i = props.inicial ?? {};
  const edicion = !!i.id;
  const [estado, accion, enviando] = useActionState(guardarPieza, undefined);
  const [tipo, setTipo] = useState(i.tipo ?? "unica");
  const [modo, setModo] = useState(i.modoPrecio ?? "fijo");
  const [leyId, setLeyId] = useState<number | null>(i.leyId ?? null);
  const [neto, setNeto] = useState(aTexto(i.pesoNetoMg, 1000));
  const [lista, setLista] = useState(aTexto(i.precioLista));
  const [oferta, setOferta] = useState(aTexto(i.precioOferta));
  const [moneda, setMoneda] = useState(i.monedaPrecio ?? "ARS");
  const [hechura, setHechura] = useState(aTexto(i.hechura));
  const [origen, setOrigen] = useState(i.origen ?? (edicion ? "compra" : "inventario"));
  const [piedras, setPiedras] = useState<Piedra[]>(i.piedras ?? []);
  const [costos, setCostos] = useState({ metal: aTexto(i.costoMetal), mo: aTexto(i.costoManoObra), piedras: aTexto(i.costoPiedras), otros: aTexto(i.costoOtros), moneda: i.monedaCosto ?? "ARS" });
  const preciosBloqueados = edicion && !props.puedePrecios;

  const ley = props.leyes.find((l) => l.id === leyId);
  const vista = useMemo(() => {
    const datos = {
      modoPrecio: modo,
      precioLista: Math.round((leer(lista) ?? 0) * 100),
      precioOferta: leer(oferta) == null ? null : Math.round(leer(oferta)! * 100),
      monedaPrecio: moneda,
      hechura: Math.round((leer(hechura) ?? 0) * 100),
      pesoNetoMg: leer(neto) == null ? null : Math.round(leer(neto)! * 1000),
      costoMetal: Math.round((leer(costos.metal) ?? 0) * 100),
      costoManoObra: Math.round((leer(costos.mo) ?? 0) * 100),
      costoPiedras: Math.round((leer(costos.piedras) ?? 0) * 100),
      costoOtros: Math.round((leer(costos.otros) ?? 0) * 100),
      monedaCosto: costos.moneda,
    };
    const precio = precioPieza(datos, ley?.gramoVenta ?? null, props.cot);
    const costo = costoPieza(datos, props.cot);
    return { precio, costo };
  }, [modo, lista, oferta, moneda, hechura, neto, costos, ley, props.cot]);
  const margen = vista.precio.vigente != null && vista.costo.enPesos ? vista.precio.vigente - vista.costo.enPesos : null;
  const $ = (c: number | null) => (c == null ? "—" : `$ ${numero(c / 100, 0)}`);

  const seccion = (titulo: string, hijos: React.ReactNode, nota?: string) => (
    <fieldset className="rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:p-6">
      <legend className="sr-only">{titulo}</legend>
      <h2 className="font-medium">{titulo}</h2>
      {nota && <p className="mt-0.5 text-xs text-gris">{nota}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hijos}</div>
    </fieldset>
  );

  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-5">
      {edicion && <input type="hidden" name="id" value={i.id} />}
      <input type="hidden" name="piedras" value={JSON.stringify(piedras)} />
      <datalist id="lista-colecciones">{props.colecciones.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="lista-artesanos">{props.artesanos.map((c) => <option key={c} value={c} />)}</datalist>

      {seccion(
        "Identificación",
        <>
          <div className="sm:col-span-2 lg:col-span-2">
            <Campo etiqueta="Nombre de la pieza" htmlFor="nombre">
              <input id="nombre" name="nombre" className="campo" defaultValue={i.nombre} required maxLength={120} placeholder="Anillo solitario con diamante" />
            </Campo>
          </div>
          <Campo etiqueta="Tipo" htmlFor="tipo">
            <select id="tipo" name="tipo" className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Categoría" htmlFor="categoriaId">
            <select id="categoriaId" name="categoriaId" className="campo" defaultValue={i.categoriaId ?? ""}>
              <option value="">Sin categoría</option>
              {props.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Código" htmlFor="codigo" ayuda={edicion ? "Cambiarlo obliga a reimprimir la etiqueta." : "Vacío = automático según la categoría (ANI-0001…)."}>
            <input id="codigo" name="codigo" className="campo uppercase" defaultValue={i.codigo} maxLength={30} autoCapitalize="characters" placeholder="Automático" />
          </Campo>
          <Campo etiqueta="Código de barras propio (opcional)" htmlFor="codigoBarras" ayuda="Si la pieza ya trae uno del proveedor. Vacío = el código.">
            <input id="codigoBarras" name="codigoBarras" className="campo" defaultValue={i.codigoBarras && i.codigoBarras !== i.codigo ? i.codigoBarras : ""} maxLength={40} />
          </Campo>
          <Campo etiqueta="Colección o línea" htmlFor="coleccion">
            <input id="coleccion" name="coleccion" className="campo" list="lista-colecciones" defaultValue={i.coleccion ?? ""} maxLength={60} />
          </Campo>
          <Campo etiqueta="Diseñador / artesano" htmlFor="artesano">
            <input id="artesano" name="artesano" className="campo" list="lista-artesanos" defaultValue={i.artesano ?? ""} maxLength={80} />
          </Campo>
        </>,
      )}

      {seccion(
        "Metal, peso y medidas",
        <>
          <Campo etiqueta="Metal y ley" htmlFor="leyId" ayuda="Las leyes se configuran en Cotizaciones.">
            <select id="leyId" name="leyId" className="campo" value={leyId ?? ""} onChange={(e) => setLeyId(Number(e.target.value) || null)}>
              <option value="">Sin ley / otro metal</option>
              {props.leyes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Metal o terminación (detalle)" htmlFor="metalDetalle" ayuda="Ej.: oro blanco, baño de oro, acero, rodinado.">
            <input id="metalDetalle" name="metalDetalle" className="campo" defaultValue={i.metalDetalle ?? ""} maxLength={60} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Peso bruto (g)" htmlFor="pesoBruto">
              <input id="pesoBruto" name="pesoBruto" className="campo" inputMode="decimal" defaultValue={aTexto(i.pesoBrutoMg, 1000)} placeholder="3,25" />
            </Campo>
            <Campo etiqueta="Peso neto (g)" htmlFor="pesoNeto" ayuda="Solo metal.">
              <input id="pesoNeto" name="pesoNeto" className="campo" inputMode="decimal" value={neto} onChange={(e) => setNeto(e.target.value)} placeholder="3,10" />
            </Campo>
          </div>
          <Campo etiqueta="Medidas" htmlFor="medidas">
            <input id="medidas" name="medidas" className="campo" defaultValue={i.medidas ?? ""} maxLength={60} placeholder="45 cm · 4 mm" />
          </Campo>
          <Campo etiqueta="Talle" htmlFor="talle">
            <input id="talle" name="talle" className="campo" defaultValue={i.talle ?? ""} maxLength={20} />
          </Campo>
        </>,
      )}

      <fieldset className="rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:p-6">
        <legend className="sr-only">Piedras</legend>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Piedras</h2>
          <button type="button" className={clasesBoton("secundario")} onClick={() => setPiedras((p) => [...p, { tipo: "", cantidad: 1, quilates: null, calidad: null, certificado: null }])}>+ Agregar piedra</button>
        </div>
        {piedras.length === 0 && <p className="mt-2 text-sm text-gris">Sin piedras.</p>}
        <ul className="mt-3 flex flex-col gap-3">
          {piedras.map((pi, k) => (
            <li key={k} className="grid grid-cols-2 gap-3 rounded-lg border border-linea bg-papel/50 p-3 sm:grid-cols-[1.4fr_0.6fr_0.8fr_1fr_1fr_auto]">
              <input aria-label="Tipo de piedra" className="campo col-span-2 sm:col-span-1" placeholder="Diamante, zafiro, perla…" value={pi.tipo} onChange={(e) => setPiedras((p) => p.map((x, j) => (j === k ? { ...x, tipo: e.target.value } : x)))} />
              <input aria-label="Cantidad" className="campo" inputMode="numeric" placeholder="Cant." value={pi.cantidad} onChange={(e) => setPiedras((p) => p.map((x, j) => (j === k ? { ...x, cantidad: Number(e.target.value) || 1 } : x)))} />
              <input aria-label="Quilates" className="campo" inputMode="decimal" placeholder="ct" defaultValue={aTexto(pi.quilates)} onChange={(e) => setPiedras((p) => p.map((x, j) => (j === k ? { ...x, quilates: leer(e.target.value) == null ? null : Math.round(leer(e.target.value)! * 100) } : x)))} />
              <input aria-label="Calidad" className="campo" placeholder="Calidad (G·VS2)" value={pi.calidad ?? ""} onChange={(e) => setPiedras((p) => p.map((x, j) => (j === k ? { ...x, calidad: e.target.value || null } : x)))} />
              <input aria-label="Certificado" className="campo" placeholder="N.º de certificado" value={pi.certificado ?? ""} onChange={(e) => setPiedras((p) => p.map((x, j) => (j === k ? { ...x, certificado: e.target.value || null } : x)))} />
              <button type="button" aria-label="Quitar piedra" className="min-h-11 rounded-lg px-3 text-sm text-error hover:bg-error-suave" onClick={() => setPiedras((p) => p.filter((_, j) => j !== k))}>Quitar</button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:p-6">
        <legend className="sr-only">Precio</legend>
        <h2 className="font-medium">Precio</h2>
        {preciosBloqueados && <p className="mt-1 text-xs text-alerta">Solo el administrador puede cambiar el precio de una pieza ya cargada.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Modo de precio">
          {[
            ["fijo", "Precio fijo", "Se cobra el precio de lista (en pesos, dólares o euros)."],
            ["gramo", "Por gramo", "Peso neto × gramo de la ley + hechura. Se actualiza solo con la cotización."],
          ].map(([k, t, d]) => (
            <label key={k} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${modo === k ? "border-tinta bg-champagne-suave/40" : "border-linea-fuerte"} ${preciosBloqueados ? "pointer-events-none opacity-60" : ""}`}>
              <input type="radio" name="modoPrecio" value={k} checked={modo === k} onChange={() => setModo(k)} className="mt-1 accent-tinta" />
              <span><span className="block text-sm font-medium">{t}</span><span className="text-xs text-gris">{d}</span></span>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modo === "fijo" ? (
            <>
              <Campo etiqueta="Precio de lista" htmlFor="precioLista">
                <input id="precioLista" name="precioLista" className="campo" inputMode="decimal" value={lista} onChange={(e) => setLista(e.target.value)} readOnly={preciosBloqueados} placeholder="450.000" />
              </Campo>
              <Campo etiqueta="Moneda" htmlFor="monedaPrecio">
                <select id="monedaPrecio" name="monedaPrecio" className="campo" value={moneda} onChange={(e) => setMoneda(e.target.value)} disabled={preciosBloqueados}>
                  {Object.entries(MONEDAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
                {preciosBloqueados && <input type="hidden" name="monedaPrecio" value={moneda} />}
              </Campo>
            </>
          ) : (
            <Campo etiqueta="Hechura / mano de obra ($)" htmlFor="hechura" ayuda="Se suma al valor del metal.">
              <input id="hechura" name="hechura" className="campo" inputMode="decimal" value={hechura} onChange={(e) => setHechura(e.target.value)} readOnly={preciosBloqueados} placeholder="60.000" />
            </Campo>
          )}
          <Campo etiqueta="Precio de oferta (opcional)" htmlFor="precioOferta">
            <input id="precioOferta" name="precioOferta" className="campo" inputMode="decimal" value={oferta} onChange={(e) => setOferta(e.target.value)} readOnly={preciosBloqueados} />
          </Campo>
          <Campo etiqueta="IVA" htmlFor="ivaPct">
            <select id="ivaPct" name="ivaPct" className="campo" defaultValue={i.ivaPct ?? 2100}>
              {ALICUOTAS_IVA.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Tratamiento de IVA" htmlFor="tratamientoIva" ayuda="«Bien usado»: el IVA se calcula solo sobre la diferencia con el costo. A validar con el contador.">
            <select id="tratamientoIva" name="tratamientoIva" className="campo" defaultValue={i.tratamientoIva ?? (i.origen === "canje" ? "bienes_usados" : "general")}>
              <option value="general">General</option>
              <option value="bienes_usados">Bien usado (régimen especial)</option>
              <option value="exento">Exento</option>
            </select>
          </Campo>
        </div>
        {modo === "gramo" && <input type="hidden" name="monedaPrecio" value="ARS" />}
        <div className="mt-4 rounded-lg bg-papel px-4 py-3" aria-live="polite">
          <p className="text-xs text-gris">Precio de hoy</p>
          <p className="titulo-serif text-3xl tabular-nums">{$(vista.precio.vigente)}</p>
          <p className="text-xs text-gris">{vista.precio.detalle}{modo === "gramo" && !ley ? " — elegí la ley del metal" : ""}</p>
        </div>
      </fieldset>

      {props.verCostos &&
        seccion(
          "Costo",
          <>
            <Campo etiqueta="Moneda del costo" htmlFor="monedaCosto">
              <select id="monedaCosto" name="monedaCosto" className="campo" value={costos.moneda} onChange={(e) => setCostos((c) => ({ ...c, moneda: e.target.value }))}>
                {Object.entries(MONEDAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </Campo>
            {(
              [
                ["costoMetal", "metal", "Metal"],
                ["costoManoObra", "mo", "Mano de obra"],
                ["costoPiedras", "piedras", "Piedras"],
                ["costoOtros", "otros", "Otros"],
              ] as const
            ).map(([name, k, t]) => (
              <Campo key={name} etiqueta={t} htmlFor={name}>
                <input id={name} name={name} className="campo" inputMode="decimal" value={costos[k]} onChange={(e) => setCostos((c) => ({ ...c, [k]: e.target.value }))} />
              </Campo>
            ))}
            <div className="flex flex-col justify-center rounded-lg bg-papel px-4 py-2 text-sm">
              <span>Costo: <strong className="tabular-nums">{$(vista.costo.enPesos)}</strong></span>
              {margen != null && vista.precio.vigente ? (
                <span className="text-gris">Margen: <span className="tabular-nums">{$(margen)} ({numero((margen / vista.precio.vigente) * 100, 0)} %)</span></span>
              ) : null}
            </div>
          </>,
          "Solo lo ven los usuarios con permiso. En dólares o euros se pasa a pesos con la cotización del día.",
        )}

      {seccion(
        "Origen y stock",
        <>
          <Campo etiqueta="Origen" htmlFor="origen">
            <select id="origen" name="origen" className="campo" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {Object.entries(ORIGENES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Campo>
          {!props.proveedores.length && <input type="hidden" name="proveedorId" value={i.proveedorId ?? ""} />}
          {origen !== "inventario" && props.proveedores.length > 0 && (
            <Campo etiqueta={origen === "consignacion" ? "Dueño de la pieza (consignante)" : "Proveedor"} htmlFor="proveedorId" ayuda={props.proveedores.length ? undefined : "Todavía no hay proveedores cargados."}>
              <select id="proveedorId" name="proveedorId" className="campo" defaultValue={i.proveedorId ?? ""} required={origen === "consignacion" && !i.consignante}>
                <option value="">{origen === "consignacion" && i.consignante ? `${i.consignante} (sin vincular)` : "—"}</option>
                {props.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
          )}
          {i.consignante && <input type="hidden" name="consignante" value={i.consignante} />}
          <Campo etiqueta="Ubicación" htmlFor="ubicacionId">
            <select id="ubicacionId" name="ubicacionId" className="campo" defaultValue={i.ubicacionId ?? ""}>
              <option value="">Sin ubicación</option>
              {props.ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Campo>
          {tipo !== "unica" && (
            <>
              <Campo etiqueta={edicion ? "Cantidad (se cambia con un ajuste)" : "Cantidad inicial"} htmlFor="cantidad">
                <input id="cantidad" name="cantidad" className="campo" inputMode="numeric" defaultValue={i.cantidad ?? 1} readOnly={edicion} />
              </Campo>
              <Campo etiqueta="Stock mínimo (aviso)" htmlFor="stockMinimo">
                <input id="stockMinimo" name="stockMinimo" className="campo" inputMode="numeric" defaultValue={i.stockMinimo ?? 0} />
              </Campo>
            </>
          )}
        </>,
      )}

      <fieldset className="grid gap-4 rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:grid-cols-2 sm:p-6">
        <legend className="sr-only">Descripción</legend>
        <Campo etiqueta="Descripción (la ve el cliente en el comprobante)" htmlFor="descripcion">
          <textarea id="descripcion" name="descripcion" className="campo min-h-24" defaultValue={i.descripcion ?? ""} maxLength={2000} />
        </Campo>
        <Campo etiqueta="Notas internas (solo el negocio)" htmlFor="notasInternas">
          <textarea id="notasInternas" name="notasInternas" className="campo min-h-24" defaultValue={i.notasInternas ?? ""} maxLength={2000} />
        </Campo>
      </fieldset>

      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-linea bg-papel/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Boton disabled={enviando} className="flex-1 sm:flex-none">{enviando ? "Guardando…" : edicion ? "Guardar cambios" : "Dar de alta"}</Boton>
        <Link href={edicion ? `/stock/${i.id}` : "/stock"} className={clasesBoton("fantasma")}>Cancelar</Link>
      </div>
    </form>
  );
}

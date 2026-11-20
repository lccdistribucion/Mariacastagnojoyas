"use client";
import { startTransition, useActionState, useMemo, useState } from "react";
import { Aviso, Boton, Campo, clasesBoton } from "@/components/ui";
import { numero } from "@/lib/formato";
import { buscarArticulo, guardarCompra } from "../acciones";

type Op = { id: number; nombre: string };
type Item =
  | { k: number; tipo: "nueva"; nombre: string; tipoPieza: string; categoriaId: string; leyId: string; neto: string; talle: string; cantidad: string; costo: string; iva: string; modo: "fijo" | "gramo"; precio: string; hechura: string; ubicacionId: string }
  | { k: number; tipo: "existente"; codigo: string; producto: { id: number; codigo: string; nombre: string; cantidad: number } | null; error?: string; cantidad: string; costo: string; iva: string }
  | { k: number; tipo: "metal"; leyId: string; gramos: string; costo: string; iva: string; descripcion: string };

const leer = (t: string) => {
  let s = t.trim().replace(/\s|\$/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const cent = (t: string) => Math.round(leer(t) * 100);
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export function FormularioCompra(p: { proveedores: Op[]; proveedorInicial: number | null; categorias: Op[]; leyes: Op[]; ubicaciones: Op[]; cot: { USD: number | null; EUR: number | null }; cajas: { id: number; nombre: string; moneda: string; tipo: string }[] }) {
  const [e, accion, enviando] = useActionState(guardarCompra, undefined);
  const [cab, setCab] = useState({ proveedorId: String(p.proveedorInicial ?? ""), fecha: hoy(), tipo: "A", pv: "", numero: "", moneda: "ARS", tc: "", condicion: "cuenta_corriente", medio: "transferencia", cajaId: "", chNum: "", chBanco: "", chFecha: "", vence: "", percIva: "", percIibb: "", otros: "", notas: "" });
  const [items, setItems] = useState<Item[]>([]);
  const [sig, setSig] = useState(1);
  const set = (k: number, cambios: Partial<Item>) => setItems((xs) => xs.map((x) => (x.k === k ? ({ ...x, ...cambios } as Item) : x)));
  const agregar = (tipo: Item["tipo"]) => {
    const base = { k: sig, iva: "21", costo: "" };
    setSig(sig + 1);
    setItems((xs) => [
      ...xs,
      tipo === "nueva"
        ? { ...base, tipo, nombre: "", tipoPieza: "unica", categoriaId: "", leyId: "", neto: "", talle: "", cantidad: "1", modo: "fijo", precio: "", hechura: "", ubicacionId: "" }
        : tipo === "existente"
          ? { ...base, tipo, codigo: "", producto: null, cantidad: "1" }
          : { ...base, tipo, leyId: String(p.leyes[0]?.id ?? ""), gramos: "", descripcion: "", iva: "0" },
    ]);
  };
  const moneda = cab.moneda;
  const tc = moneda === "ARS" ? 1 : leer(cab.tc) || (moneda === "USD" ? p.cot.USD : p.cot.EUR) || 0;

  const totales = useMemo(() => {
    let neto = 0;
    let iva = 0;
    for (const it of items) {
      const sub = it.tipo === "metal" ? Math.round(leer(it.gramos) * cent(it.costo)) : Math.round(leer(it.cantidad)) * cent(it.costo);
      neto += sub;
      if (cab.tipo === "A") iva += Math.round((sub * leer(it.iva) * 100) / 10000);
    }
    const total = neto + iva + cent(cab.percIva) + cent(cab.percIibb) + cent(cab.otros);
    return { neto, iva, total };
  }, [items, cab]);
  const $ = (c: number) => `${moneda === "ARS" ? "$" : moneda} ${numero(c / 100, 2)}`;
  const cajasMedio = p.cajas.filter((x) => x.moneda === moneda && (cab.medio === "transferencia" ? ["banco", "billetera"].includes(x.tipo) : cab.medio === "efectivo" ? x.tipo === "efectivo" : !["tarjetas", "cheques"].includes(x.tipo)));
  const bancos = p.cajas.filter((x) => x.tipo === "banco" && x.moneda === "ARS");

  const datos = () => ({
    proveedorId: Number(cab.proveedorId),
    fecha: cab.fecha,
    tipoComprobante: cab.tipo,
    puntoVenta: cab.pv ? Number(cab.pv) : null,
    numero: cab.numero ? Number(cab.numero) : null,
    moneda,
    tipoCambio: tc,
    condicion: cab.condicion,
    medioPago: cab.condicion === "contado" ? cab.medio : undefined,
    cajaId: cab.condicion === "contado" && cab.medio !== "cheque" ? (cajasMedio.find((x) => String(x.id) === cab.cajaId)?.id ?? (["tarjeta", "otro"].includes(cab.medio) ? null : (cajasMedio[0]?.id ?? null))) : null,
    chequePropio: cab.condicion === "contado" && cab.medio === "cheque" ? { numero: cab.chNum, bancoCajaId: Number(cab.chBanco || bancos[0]?.id), fechaPago: cab.chFecha } : null,
    exigirCaja: true,
    vencimiento: cab.condicion === "cuenta_corriente" && cab.vence ? cab.vence : null,
    percepcionIva: cent(cab.percIva),
    percepcionIibb: cent(cab.percIibb),
    otrosImpuestos: cent(cab.otros),
    notas: cab.notas,
    items: items.map((it) =>
      it.tipo === "metal"
        ? { tipo: "metal", leyId: Number(it.leyId), pesoMg: Math.round(leer(it.gramos) * 1000), costoUnitario: cent(it.costo), ivaPct: Math.round(leer(it.iva) * 100), descripcion: it.descripcion }
        : it.tipo === "existente"
          ? { tipo: "pieza", productoId: it.producto?.id ?? 0, nueva: null, cantidad: Math.round(leer(it.cantidad)), costoUnitario: cent(it.costo), ivaPct: Math.round(leer(it.iva) * 100) }
          : {
              tipo: "pieza",
              productoId: null,
              cantidad: it.tipoPieza === "unica" ? 1 : Math.round(leer(it.cantidad)),
              costoUnitario: cent(it.costo),
              ivaPct: Math.round(leer(it.iva) * 100),
              nueva: {
                codigo: "", codigoBarras: null, nombre: it.nombre, tipo: it.tipoPieza, categoriaId: Number(it.categoriaId) || null, coleccion: null, artesano: null, leyId: Number(it.leyId) || null, metalDetalle: null,
                pesoBrutoMg: null, pesoNetoMg: leer(it.neto) ? Math.round(leer(it.neto) * 1000) : null, medidas: null, talle: it.talle || null, descripcion: null, notasInternas: null,
                modoPrecio: it.modo, precioLista: it.modo === "fijo" ? cent(it.precio) : 0, precioOferta: null, monedaPrecio: "ARS", hechura: it.modo === "gramo" ? cent(it.hechura) : 0, ivaPct: 2100,
                consignante: null, ubicacionId: Number(it.ubicacionId) || null, stockMinimo: 0, piedras: [],
              },
            },
    ),
  });

  const c = (k: keyof typeof cab) => ({ value: cab[k], onChange: (x: { target: { value: string } }) => setCab((s) => ({ ...s, [k]: x.target.value })) });
  const card = "rounded-xl border border-linea bg-superficie p-4 shadow-suave sm:p-6";

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData();
        f.set("datos", JSON.stringify(datos()));
        startTransition(() => accion(f));
      }}
      className="flex flex-col gap-5"
    >
      <section className={card}>
        <h2 className="mb-4 font-medium">Comprobante</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2"><Campo etiqueta="Proveedor" htmlFor="cProv"><select id="cProv" className="campo" required {...c("proveedorId")}><option value="">Elegí…</option>{p.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo></div>
          <Campo etiqueta="Fecha" htmlFor="cFecha"><input id="cFecha" type="date" className="campo" required {...c("fecha")} /></Campo>
          <Campo etiqueta="Comprobante" htmlFor="cTipo">
            <select id="cTipo" className="campo" {...c("tipo")}><option value="A">Factura A</option><option value="B">Factura B</option><option value="C">Factura C</option><option value="X">Interno / sin factura</option><option value="R">Remito</option></select>
          </Campo>
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <Campo etiqueta="Pto. venta" htmlFor="cPv"><input id="cPv" className="campo" inputMode="numeric" {...c("pv")} /></Campo>
            <Campo etiqueta="Número" htmlFor="cNum"><input id="cNum" className="campo" inputMode="numeric" {...c("numero")} /></Campo>
          </div>
          <Campo etiqueta="Moneda" htmlFor="cMon"><select id="cMon" className="campo" {...c("moneda")}><option value="ARS">Pesos</option><option value="USD">Dólares</option><option value="EUR">Euros</option></select></Campo>
          {moneda !== "ARS" && <Campo etiqueta="Tipo de cambio" htmlFor="cTc" ayuda={`Hoy: ${numero((moneda === "USD" ? p.cot.USD : p.cot.EUR) ?? 0, 2)}`}><input id="cTc" className="campo" inputMode="decimal" placeholder={numero((moneda === "USD" ? p.cot.USD : p.cot.EUR) ?? 0, 2)} {...c("tc")} /></Campo>}
          <Campo etiqueta="Condición" htmlFor="cCond"><select id="cCond" className="campo" {...c("condicion")}><option value="cuenta_corriente">Cuenta corriente</option><option value="contado">Contado (ya pagada)</option></select></Campo>
          {cab.condicion === "contado" ? (
            <>
              <Campo etiqueta="Se pagó con" htmlFor="cMedio"><select id="cMedio" className="campo" {...c("medio")}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option>{moneda === "ARS" && <option value="cheque">Cheque propio</option>}<option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></Campo>
              {cab.medio === "cheque" ? (
                <>
                  <Campo etiqueta="N.º de cheque" htmlFor="cChNum"><input id="cChNum" className="campo" {...c("chNum")} /></Campo>
                  <Campo etiqueta="Banco" htmlFor="cChBanco"><select id="cChBanco" className="campo" {...c("chBanco")}>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></Campo>
                  <Campo etiqueta="Fecha de pago" htmlFor="cChFecha"><input id="cChFecha" type="date" className="campo" {...c("chFecha")} /></Campo>
                </>
              ) : (
                <Campo etiqueta="Salió de" htmlFor="cCaja" ayuda={!cajasMedio.length ? `No hay cajas en ${moneda} para este medio.` : undefined}>
                  <select id="cCaja" className="campo" {...c("cajaId")}>
                    {["tarjeta", "otro"].includes(cab.medio) && <option value="">No mueve caja</option>}
                    {cajasMedio.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                </Campo>
              )}
            </>
          ) : (
            <Campo etiqueta="Vence" htmlFor="cVence" ayuda="Vacío = según los días de pago del proveedor."><input id="cVence" type="date" className="campo" {...c("vence")} /></Campo>
          )}
        </div>
      </section>

      <section className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Ítems</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={clasesBoton("secundario")} onClick={() => agregar("nueva")}>+ Pieza nueva</button>
            <button type="button" className={clasesBoton("secundario")} onClick={() => agregar("existente")}>+ Unidades de un artículo</button>
            <button type="button" className={clasesBoton("secundario")} onClick={() => agregar("metal")}>+ Metal por gramo</button>
          </div>
        </div>
        {!items.length && <p className="text-sm text-gris">Agregá lo que llegó: piezas nuevas (se dan de alta en el stock), más unidades de un artículo que ya existe, o metal por gramo.</p>}
        <ol className="flex flex-col gap-3">
          {items.map((it, n) => (
            <li key={it.k} className="rounded-lg border border-linea bg-papel/50 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{n + 1}. {it.tipo === "nueva" ? "Pieza nueva" : it.tipo === "existente" ? "Unidades de un artículo" : "Metal por gramo"}</span>
                <button type="button" className="min-h-9 px-2 text-xs text-error" onClick={() => setItems((xs) => xs.filter((x) => x.k !== it.k))}>Quitar</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {it.tipo === "nueva" && (
                  <>
                    <div className="sm:col-span-2"><Campo etiqueta="Nombre" htmlFor={`n${it.k}`}><input id={`n${it.k}`} className="campo" value={it.nombre} onChange={(x) => set(it.k, { nombre: x.target.value })} required /></Campo></div>
                    <Campo etiqueta="Tipo" htmlFor={`t${it.k}`}><select id={`t${it.k}`} className="campo" value={it.tipoPieza} onChange={(x) => set(it.k, { tipoPieza: x.target.value })}><option value="unica">Pieza única</option><option value="cantidad">Por cantidad</option><option value="insumo">Insumo / piedra suelta</option><option value="packaging">Packaging</option></select></Campo>
                    <Campo etiqueta="Categoría" htmlFor={`c${it.k}`}><select id={`c${it.k}`} className="campo" value={it.categoriaId} onChange={(x) => set(it.k, { categoriaId: x.target.value })}><option value="">—</option>{p.categorias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                    <Campo etiqueta="Ley" htmlFor={`l${it.k}`}><select id={`l${it.k}`} className="campo" value={it.leyId} onChange={(x) => set(it.k, { leyId: x.target.value })}><option value="">—</option>{p.leyes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                    <Campo etiqueta="Peso neto (g)" htmlFor={`g${it.k}`}><input id={`g${it.k}`} className="campo" inputMode="decimal" value={it.neto} onChange={(x) => set(it.k, { neto: x.target.value })} /></Campo>
                    {it.tipoPieza !== "unica" && <Campo etiqueta="Cantidad" htmlFor={`q${it.k}`}><input id={`q${it.k}`} className="campo" inputMode="numeric" value={it.cantidad} onChange={(x) => set(it.k, { cantidad: x.target.value })} /></Campo>}
                    <Campo etiqueta={`Costo unitario (${moneda})`} htmlFor={`co${it.k}`}><input id={`co${it.k}`} className="campo" inputMode="decimal" value={it.costo} onChange={(x) => set(it.k, { costo: x.target.value })} required /></Campo>
                    <Campo etiqueta="Precio de venta" htmlFor={`m${it.k}`}><select id={`m${it.k}`} className="campo" value={it.modo} onChange={(x) => set(it.k, { modo: x.target.value as "fijo" | "gramo" })}><option value="fijo">Fijo ($)</option><option value="gramo">Por gramo + hechura</option></select></Campo>
                    {it.modo === "fijo" ? (
                      <Campo etiqueta="Precio de lista $" htmlFor={`pr${it.k}`}><input id={`pr${it.k}`} className="campo" inputMode="decimal" value={it.precio} onChange={(x) => set(it.k, { precio: x.target.value })} /></Campo>
                    ) : (
                      <Campo etiqueta="Hechura $" htmlFor={`h${it.k}`}><input id={`h${it.k}`} className="campo" inputMode="decimal" value={it.hechura} onChange={(x) => set(it.k, { hechura: x.target.value })} /></Campo>
                    )}
                    <Campo etiqueta="Ubicación" htmlFor={`u${it.k}`}><select id={`u${it.k}`} className="campo" value={it.ubicacionId} onChange={(x) => set(it.k, { ubicacionId: x.target.value })}><option value="">—</option>{p.ubicaciones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                  </>
                )}
                {it.tipo === "existente" && (
                  <>
                    <Campo etiqueta="Código del artículo" htmlFor={`cod${it.k}`}>
                      <input
                        id={`cod${it.k}`}
                        className="campo uppercase"
                        value={it.codigo}
                        onChange={(x) => set(it.k, { codigo: x.target.value, producto: null, error: undefined })}
                        onBlur={async () => {
                          if (!it.codigo.trim()) return;
                          const r = await buscarArticulo(it.codigo);
                          set(it.k, "error" in r && r.error ? { error: r.error, producto: null } : { producto: r as { id: number; codigo: string; nombre: string; cantidad: number }, error: undefined });
                        }}
                      />
                    </Campo>
                    <div className="flex items-end text-sm sm:col-span-1 lg:col-span-1">{it.producto ? <span>{it.producto.nombre} <span className="text-gris">(hay {it.producto.cantidad})</span></span> : it.error ? <span className="text-error">{it.error}</span> : <span className="text-gris">Escribí el código y salí del campo.</span>}</div>
                    <Campo etiqueta="Cantidad" htmlFor={`q${it.k}`}><input id={`q${it.k}`} className="campo" inputMode="numeric" value={it.cantidad} onChange={(x) => set(it.k, { cantidad: x.target.value })} /></Campo>
                    <Campo etiqueta={`Costo unitario (${moneda})`} htmlFor={`co${it.k}`}><input id={`co${it.k}`} className="campo" inputMode="decimal" value={it.costo} onChange={(x) => set(it.k, { costo: x.target.value })} required /></Campo>
                  </>
                )}
                {it.tipo === "metal" && (
                  <>
                    <Campo etiqueta="Ley" htmlFor={`l${it.k}`}><select id={`l${it.k}`} className="campo" value={it.leyId} onChange={(x) => set(it.k, { leyId: x.target.value })}>{p.leyes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                    <Campo etiqueta="Gramos" htmlFor={`g${it.k}`}><input id={`g${it.k}`} className="campo" inputMode="decimal" value={it.gramos} onChange={(x) => set(it.k, { gramos: x.target.value })} required /></Campo>
                    <Campo etiqueta={`Precio por gramo (${moneda})`} htmlFor={`co${it.k}`}><input id={`co${it.k}`} className="campo" inputMode="decimal" value={it.costo} onChange={(x) => set(it.k, { costo: x.target.value })} required /></Campo>
                    <Campo etiqueta="Detalle" htmlFor={`d${it.k}`}><input id={`d${it.k}`} className="campo" value={it.descripcion} onChange={(x) => set(it.k, { descripcion: x.target.value })} placeholder="Oro en grano, chapa…" /></Campo>
                  </>
                )}
                {cab.tipo === "A" && <Campo etiqueta="IVA %" htmlFor={`iva${it.k}`}><select id={`iva${it.k}`} className="campo" value={it.iva} onChange={(x) => set(it.k, { iva: x.target.value })}><option value="21">21</option><option value="10,5">10,5</option><option value="0">0</option></select></Campo>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={card}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Percepción IVA" htmlFor="cPi"><input id="cPi" className="campo" inputMode="decimal" {...c("percIva")} /></Campo>
          <Campo etiqueta="Percepción IIBB" htmlFor="cPb"><input id="cPb" className="campo" inputMode="decimal" {...c("percIibb")} /></Campo>
          <Campo etiqueta="Otros impuestos" htmlFor="cOt"><input id="cOt" className="campo" inputMode="decimal" {...c("otros")} /></Campo>
          <div className="sm:col-span-3"><Campo etiqueta="Notas" htmlFor="cNotas"><input id="cNotas" className="campo" {...c("notas")} /></Campo></div>
        </div>
        <dl className="mt-5 flex flex-col items-end gap-1 text-sm tabular-nums">
          <div className="flex gap-6"><dt className="text-gris">Neto</dt><dd>{$(totales.neto)}</dd></div>
          {cab.tipo === "A" && <div className="flex gap-6"><dt className="text-gris">IVA</dt><dd>{$(totales.iva)}</dd></div>}
          <div className="flex items-baseline gap-6"><dt className="text-gris">Total</dt><dd className="titulo-serif text-3xl">{$(totales.total)}</dd></div>
          {moneda !== "ARS" && tc > 0 && <div className="text-xs text-gris">≈ $ {numero((totales.total / 100) * tc, 0)} a {numero(tc, 2)}</div>}
        </dl>
      </section>
      {e?.error && <Aviso tono="error">{e.error}</Aviso>}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-linea bg-papel/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Boton disabled={enviando || !items.length || !cab.proveedorId} className="w-full sm:w-auto">{enviando ? "Guardando…" : "Registrar la compra"}</Boton>
      </div>
    </form>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PanelPagos, aCentavos, pesosTxt, type MedioCliente, type PagoEnviado } from "@/components/pagos";
import { Aviso, Boton, clasesBoton, Etiqueta, Tarjeta } from "@/components/ui";
import type { CanjeIn, ItemIn } from "@/lib/ventas/motor";
import { buscarClientes, buscarPiezas, clienteRapido, confirmarVenta, guardarPresupuesto, reservar, vistaPrevia, type Carrito } from "./acciones";

type Pieza = Awaited<ReturnType<typeof buscarPiezas>>[number] & { cantidadInicial?: number };
type Cliente = { id: number; nombre: string; documento: string | null; saldo: number; whatsapp?: string | null };
type Servicio = { ref: string; texto: string; clienteId: number; listo: boolean };
export type Inicial = { piezas: Pieza[]; clienteId: number | null; reservaId: number | null; presupuestoId: number | null; servicios: string[]; descuentoPct: number; listaId: number | null };

type Linea = { clave: number } & ({ kind: "pieza"; pieza: Pieza; cantidad: number; precio: string } | { kind: "servicio"; ref: string; texto: string } | { kind: "gift"; monto: number });
type Canje = { clave: number; leyId: number; gramos: string; descripcion: string; destino: "metal" | "pieza" };
type Previa = Awaited<ReturnType<typeof vistaPrevia>>;
type Hecho = { tipo: "venta" | "presupuesto" | "reserva"; id: number; numero?: number; fiscal?: { ok?: string; error?: string; aviso?: string; id?: number } | null };

let n = 1;
const gramosTxt = (mg: number | null) => (mg == null ? null : `${(mg / 1000).toLocaleString("es-AR", { maximumFractionDigits: 2 })} g`);
const pctTxt = (t: string) => Math.round((Number(t.replace(",", ".")) || 0) * 100);

export function Mostrador(props: {
  inicial: Inicial;
  cliente: Cliente | null;
  medios: MedioCliente[];
  cot: { USD: number | null; EUR: number | null };
  listas: { id: number; nombre: string }[];
  leyes: { id: number; nombre: string }[];
  servicios: Servicio[];
  permisos: { modificarPrecios: boolean; sinFacturar: boolean };
  diasReserva: number;
}) {
  const { inicial } = props;
  const [lineas, setLineas] = useState<Linea[]>(() => [
    ...inicial.piezas.map((p) => ({ clave: n++, kind: "pieza" as const, pieza: p, cantidad: p.cantidadInicial ?? 1, precio: "" })),
    ...inicial.servicios.map((r) => ({ clave: n++, kind: "servicio" as const, ref: r, texto: props.servicios.find((s) => s.ref === r)?.texto ?? r })),
  ]);
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(props.cliente);
  const [listaId, setListaId] = useState<number | null>(inicial.listaId);
  const [descuento, setDescuento] = useState(inicial.descuentoPct ? String(inicial.descuentoPct / 100).replace(".", ",") : "");
  const [tipo, setTipo] = useState<"factura" | "interno">("factura");
  const [notas, setNotas] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [paso, setPaso] = useState<"armar" | "cobrar" | "reservar">("armar");
  const [pagos, setPagos] = useState<{ p: PagoEnviado[]; falta: number }>({ p: [], falta: 0 });
  const [auth, setAuth] = useState<{ usuario: string; clave: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [enviando, iniciar] = useTransition();
  const [ficha, setFicha] = useState<Pieza | null>(null);

  const carrito: Carrito = useMemo(
    () => ({
      clienteId: cliente?.id ?? null,
      listaId,
      descuentoPct: pctTxt(descuento),
      tipoComprobante: tipo,
      notas,
      presupuestoId: inicial.presupuestoId,
      reservaId: inicial.reservaId,
      items: lineas.map((l): ItemIn => (l.kind === "pieza" ? { tipo: "pieza", productoId: l.pieza.id, cantidad: l.cantidad, precioUnitario: l.precio ? aCentavos(l.precio) : null } : l.kind === "servicio" ? { tipo: "servicio", referencia: l.ref } : { tipo: "gift_card", monto: l.monto })),
      canjes: canjes.filter((c) => aCentavos(c.gramos) > 0).map((c): CanjeIn => ({ leyId: c.leyId, pesoMg: aCentavos(c.gramos) * 10, descripcion: c.descripcion || "Metal usado", destino: c.destino })),
    }),
    [cliente, listaId, descuento, tipo, notas, lineas, canjes, inicial.presupuestoId, inicial.reservaId],
  );

  // Precios y totales los calcula el servidor (con la cotización del momento).
  useEffect(() => {
    if (!carrito.items.length) {
      setPrevia(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => vistaPrevia(carrito).then((r) => vigente && setPrevia(r)), 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [carrito]);

  const agregar = (p: Pieza) => {
    setError(null);
    setLineas((ls) => {
      const ya = ls.find((l) => l.kind === "pieza" && l.pieza.id === p.id);
      if (ya && p.tipo === "unica") return ls;
      if (ya) return ls.map((l) => (l === ya && l.kind === "pieza" ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...ls, { clave: n++, kind: "pieza", pieza: p, cantidad: 1, precio: "" }];
    });
    setFicha(null);
  };
  const quitar = (clave: number) => setLineas((ls) => ls.filter((l) => l.clave !== clave));
  const ok = previa?.ok ? previa : null;
  const total = ok ? ok.total : 0;
  const senas = ok?.senas.map((s) => ({ ...s, etiqueta: s.ref.startsWith("reserva") ? "Seña de la reserva" : s.ref.startsWith("pedido") ? "Seña del pedido" : "Seña de la reparación" })) ?? [];
  const soloPiezasUnicas = lineas.length > 0 && lineas.every((l) => l.kind === "pieza" && l.pieza.tipo === "unica") && !inicial.reservaId;

  const confirmar = () =>
    iniciar(async () => {
      setError(null);
      const r = await confirmarVenta(carrito, pagos.p, auth);
      if (r.ok) setHecho({ tipo: "venta", id: r.id, numero: r.numero, fiscal: r.fiscal });
      else {
        setError(r.error);
        if ("pideAutorizacion" in r && r.pideAutorizacion) setAuth({ usuario: "", clave: "" });
      }
    });

  if (hecho) return <Listo hecho={hecho} cliente={cliente} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-serif text-3xl leading-tight sm:text-4xl">Mostrador</h1>
          <p className="mt-1 text-sm text-gris">
            {inicial.reservaId ? `Retiro de la reserva N.º ${inicial.reservaId}. ` : ""}
            {inicial.presupuestoId ? `Venta del presupuesto aceptado. ` : ""}
            Buscá o escaneá la pieza, elegí el cliente y cobrá.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/ventas" className={clasesBoton("secundario")}>Ventas</Link>
          <Link href="/ventas/reservas" className={clasesBoton("secundario")}>Reservas</Link>
          <Link href="/ventas/presupuestos" className={clasesBoton("secundario")}>Presupuestos</Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* Columna izquierda: buscar y agregar */}
        <div className={`flex flex-col gap-5 ${paso !== "armar" ? "hidden lg:flex" : ""}`}>
          <Buscador onAgregar={agregar} onVer={setFicha} enCarrito={new Set(lineas.flatMap((l) => (l.kind === "pieza" ? [l.pieza.id] : [])))} />
          <Extras
            servicios={props.servicios.filter((s) => !cliente || s.clienteId === cliente.id)}
            usados={new Set(lineas.flatMap((l) => (l.kind === "servicio" ? [l.ref] : [])))}
            leyes={props.leyes}
            onServicio={(s) => {
              setLineas((ls) => [...ls, { clave: n++, kind: "servicio", ref: s.ref, texto: s.texto }]);
              if (!cliente) setCliente({ id: s.clienteId, nombre: s.texto.split(" · ")[1] ?? "Cliente", documento: null, saldo: 0 });
            }}
            onGift={(monto) => setLineas((ls) => [...ls, { clave: n++, kind: "gift", monto }])}
            onCanje={(c) => setCanjes((cs) => [...cs, { ...c, clave: n++ }])}
          />
        </div>

        {/* Columna derecha: la venta */}
        <div className="flex flex-col gap-4">
          <Tarjeta className="p-4 sm:p-5">
            <SelectorCliente cliente={cliente} onCambio={setCliente} />
          </Tarjeta>

          <Tarjeta id="venta" className="scroll-mt-28">
            <div className="flex items-center justify-between border-b border-linea px-4 py-3 sm:px-5">
              <h2 className="font-medium">Venta</h2>
              {lineas.length > 0 && paso === "armar" && (
                <button type="button" className="text-sm text-gris hover:text-error" onClick={() => { setLineas([]); setCanjes([]); }}>Vaciar</button>
              )}
            </div>
            {!lineas.length && <p className="px-5 py-10 text-center text-sm text-gris">Todavía no agregaste nada. Escaneá el código o buscá la pieza.</p>}
            <ul className="divide-y divide-linea" aria-label="Lo que se vende">
              {lineas.map((l, i) => {
                const r = ok?.renglones[i];
                return (
                  <li key={l.clave} className="flex gap-3 px-4 py-3 sm:px-5">
                    {l.kind === "pieza" && <Miniatura foto={l.pieza.foto} nombre={l.pieza.nombre} />}
                    {l.kind !== "pieza" && <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-champagne-suave text-xl" aria-hidden>{l.kind === "gift" ? "🎁" : "🛠"}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug font-medium">{l.kind === "pieza" ? l.pieza.nombre : l.kind === "gift" ? "Gift card" : (r?.descripcion ?? l.texto)}</p>
                      {l.kind === "pieza" && <p className="text-xs text-gris">{[l.pieza.codigo, l.pieza.metal, gramosTxt(l.pieza.pesoNetoMg), l.pieza.talle && `talle ${l.pieza.talle}`].filter(Boolean).join(" · ")}</p>}
                      {l.kind === "pieza" && paso === "armar" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {l.pieza.tipo !== "unica" && (
                            <label className="flex items-center gap-1 text-xs whitespace-nowrap text-gris">
                              Cant.
                              <input type="number" min={1} max={l.pieza.cantidad} className="campo h-9 min-h-9 w-16 py-1" value={l.cantidad} onChange={(e) => setLineas((ls) => ls.map((x) => (x.clave === l.clave && x.kind === "pieza" ? { ...x, cantidad: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                            </label>
                          )}
                          {props.permisos.modificarPrecios && (
                            <label className="flex items-center gap-1 text-xs whitespace-nowrap text-gris">
                              Precio $
                              <input inputMode="decimal" className="campo h-9 min-h-9 w-28 py-1 text-right placeholder:text-xs" placeholder="especial" aria-label={`Precio especial de ${l.pieza.codigo}`} value={l.precio} onChange={(e) => setLineas((ls) => ls.map((x) => (x.clave === l.clave && x.kind === "pieza" ? { ...x, precio: e.target.value } : x)))} />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-medium tabular-nums whitespace-nowrap">{r ? pesosTxt(r.subtotal) : l.kind === "gift" ? pesosTxt(l.monto) : "…"}</span>
                      {r && r.cantidad > 1 && <span className="text-xs text-gris tabular-nums">{r.cantidad} × {pesosTxt(r.precioUnitario)}</span>}
                      {paso === "armar" && <button type="button" className="min-h-9 px-1 text-xs text-gris hover:text-error" onClick={() => quitar(l.clave)} aria-label={`Quitar ${l.kind === "pieza" ? l.pieza.codigo : "renglón"}`}>Quitar</button>}
                    </div>
                  </li>
                );
              })}
              {canjes.map((c) => {
                const v = ok?.canjes.find((x) => x.leyId === c.leyId && x.pesoMg === aCentavos(c.gramos) * 10);
                return (
                  <li key={c.clave} className="flex items-start justify-between gap-3 bg-champagne-suave/40 px-4 py-3 text-sm sm:px-5">
                    <span>
                      <span className="font-medium">Canje:</span> {c.descripcion || "metal usado"} · {props.leyes.find((l) => l.id === c.leyId)?.nombre} · {c.gramos} g
                      {v && <span className="block text-xs text-gris">a {pesosTxt(v.precioGramo)} el gramo · {c.destino === "metal" ? "va a fundición" : "entra como pieza usada"}</span>}
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="tabular-nums text-ok">{v ? `−${pesosTxt(v.valor)}` : "…"}</span>
                      {paso === "armar" && <button type="button" className="min-h-9 text-xs text-gris hover:text-error" onClick={() => setCanjes((cs) => cs.filter((x) => x.clave !== c.clave))}>Quitar</button>}
                    </span>
                  </li>
                );
              })}
            </ul>

            {lineas.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-linea px-4 py-4 sm:px-5">
                {paso === "armar" && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-gris">
                      Lista de precios
                      <select className="campo" value={listaId ?? ""} onChange={(e) => setListaId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">General</option>
                        {props.listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-gris">
                      Descuento %
                      <input className="campo text-right" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" aria-label="Descuento en porcentaje" />
                    </label>
                  </div>
                )}
                {previa && !previa.ok && <Aviso tono="error">{previa.error}</Aviso>}
                {ok && (
                  <dl className="flex flex-col gap-1 text-sm">
                    <div className="flex justify-between"><dt className="text-gris">Subtotal</dt><dd className="tabular-nums">{pesosTxt(ok.subtotal)}</dd></div>
                    {ok.descuento > 0 && <div className="flex justify-between"><dt className="text-gris">Descuento {descuento} %</dt><dd className="tabular-nums">−{pesosTxt(ok.descuento)}</dd></div>}
                    {ok.canje > 0 && <div className="flex justify-between"><dt className="text-gris">Canje de metal</dt><dd className="tabular-nums">−{pesosTxt(ok.canje)}</dd></div>}
                    <div className="mt-1 flex items-baseline justify-between border-t border-linea pt-2"><dt className="font-medium">Total</dt><dd className="titulo-serif text-3xl tabular-nums" data-testid="total">{pesosTxt(ok.total)}</dd></div>
                    {ok.total < 0 && <p className="text-xs text-error">El canje supera la compra: la diferencia no se paga en efectivo desde el mostrador (ajustá el canje).</p>}
                    {pctTxt(descuento) > ok.descuentoMaxPct && <p className="text-xs text-alerta">El descuento supera tu tope ({ok.descuentoMaxPct / 100} %): al cobrar se pide la autorización de un administrador.</p>}
                  </dl>
                )}
                {paso === "armar" && (
                  <div className="flex flex-col gap-2">
                    <Boton type="button" className="w-full text-base" disabled={!ok || total < 0 || enviando} onClick={() => { setError(null); setPaso("cobrar"); }}>
                      Cobrar {ok ? pesosTxt(total) : ""}
                    </Boton>
                    <div className="grid grid-cols-2 gap-2">
                      <Boton type="button" variante="secundario" disabled={!ok || enviando || lineas.some((l) => l.kind !== "pieza") || canjes.length > 0} onClick={() => iniciar(async () => {
                        setError(null);
                        const r = await guardarPresupuesto(carrito);
                        if (r.ok) setHecho({ tipo: "presupuesto", id: r.id });
                        else setError(r.error);
                      })}>Presupuesto</Boton>
                      <Boton type="button" variante="secundario" disabled={!ok || enviando || !soloPiezasUnicas} title={soloPiezasUnicas ? "" : "Se reservan piezas únicas del stock"} onClick={() => { setError(null); setPaso("reservar"); }}>Reservar</Boton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Tarjeta>

          {paso === "cobrar" && ok && (
            <Tarjeta className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium">Cobro</h2>
                <button type="button" className="text-sm underline underline-offset-4" onClick={() => setPaso("armar")}>← Volver a la venta</button>
              </div>
              <PanelPagos total={total} medios={props.medios} cot={props.cot} senas={senas} saldoFavor={-(ok.saldoCliente ?? 0)} ventas conCliente={!!cliente} onCambio={(p, _r, falta) => setPagos({ p, falta })} />
              <div className="mt-4 flex flex-col gap-3 border-t border-linea pt-4">
                {props.permisos.sinFacturar && (
                  <fieldset className="flex flex-wrap gap-2 text-sm">
                    <legend className="mb-1 text-xs text-gris">Comprobante</legend>
                    {(["factura", "interno"] as const).map((t) => (
                      <label key={t} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 ${tipo === t ? "border-tinta bg-tinta text-white" : "border-linea-fuerte"}`}>
                        <input type="radio" className="sr-only" checked={tipo === t} onChange={() => setTipo(t)} />
                        {t === "factura" ? "Con factura" : "Sin facturar (interno)"}
                      </label>
                    ))}
                  </fieldset>
                )}
                <input className="campo" placeholder="Nota para el comprobante (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} aria-label="Nota" />
                {auth && (
                  <div className="rounded-lg border border-alerta/30 bg-alerta-suave p-3">
                    <p className="mb-2 text-sm">Autorización de un administrador para el descuento:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="campo" placeholder="Usuario" autoComplete="off" aria-label="Usuario administrador" value={auth.usuario} onChange={(e) => setAuth({ ...auth, usuario: e.target.value })} />
                      <input className="campo" type="password" placeholder="Contraseña" autoComplete="new-password" aria-label="Contraseña del administrador" value={auth.clave} onChange={(e) => setAuth({ ...auth, clave: e.target.value })} />
                    </div>
                  </div>
                )}
                {error && <Aviso tono="error">{error}</Aviso>}
                <Boton type="button" className="w-full text-base" disabled={enviando || pagos.falta !== 0 || !pagos.p.length} onClick={confirmar}>
                  {enviando ? "Registrando…" : "Confirmar venta"}
                </Boton>
              </div>
            </Tarjeta>
          )}

          {paso === "reservar" && ok && <PanelReserva carrito={carrito} cliente={cliente} medios={props.medios} cot={props.cot} dias={props.diasReserva} onVolver={() => setPaso("armar")} onListo={(id) => setHecho({ tipo: "reserva", id })} />}
          {paso === "armar" && error && <Aviso tono="error">{error}</Aviso>}
        </div>
      </div>
      {paso === "armar" && lineas.length > 0 && (
        <div className="h-20 lg:hidden" aria-hidden />
      )}
      {paso === "armar" && lineas.length > 0 && (
        <a href="#venta" className="fixed inset-x-3 bottom-3 z-40 flex min-h-14 items-center justify-between rounded-xl bg-tinta px-5 text-white shadow-lg lg:hidden">
          <span className="text-sm">Ver la venta ({lineas.length})</span>
          <span className="font-medium tabular-nums">{ok ? pesosTxt(ok.total) : "…"}</span>
        </a>
      )}
      {ficha && <Ficha p={ficha} onCerrar={() => setFicha(null)} onAgregar={() => agregar(ficha)} />}
    </div>
  );
}

function Miniatura({ foto, nombre, grande }: { foto: string | null; nombre: string; grande?: boolean }) {
  const cls = grande ? "aspect-square w-full" : "size-14 shrink-0";
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/stock-foto?a=${encodeURIComponent(foto)}${grande ? "" : "&mini=1"}`} alt={nombre} className={`${cls} rounded-lg bg-papel object-cover`} />
  ) : (
    <div className={`${cls} flex items-center justify-center rounded-lg bg-papel text-xs text-gris`}>Sin foto</div>
  );
}

function Buscador({ onAgregar, onVer, enCarrito }: { onAgregar: (p: Pieza) => void; onVer: (p: Pieza) => void; enCarrito: Set<number> }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Pieza[] | null>(null);
  const [buscando, iniciar] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const buscar = (texto: string, desdeEnter: boolean) =>
    iniciar(async () => {
      const r = await buscarPiezas(texto);
      // El lector de códigos escribe el código y aprieta Enter: si coincide exacto, va directo a la venta.
      const exacto = r.filter((p) => p.codigo.toUpperCase() === texto.trim().toUpperCase() || p.barras === texto.trim());
      if (desdeEnter && exacto.length === 1) {
        onAgregar(exacto[0]);
        setQ("");
        setRes(null);
        ref.current?.focus();
        return;
      }
      setRes(r);
    });
  return (
    <Tarjeta className="p-4 sm:p-5">
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) buscar(q, true); }} className="flex gap-2">
        <input ref={ref} className="campo flex-1" placeholder="Código, código de barras o nombre" aria-label="Buscar pieza" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
        <Boton disabled={buscando}>Buscar</Boton>
      </form>
      {res && (
        <div className="mt-4">
          {!res.length && <p className="py-6 text-center text-sm text-gris">No hay piezas disponibles con «{q}».</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {res.map((p) => (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-linea bg-superficie">
                <button type="button" onClick={() => onVer(p)} className="text-left" aria-label={`Ver ${p.codigo}`}>
                  <Miniatura foto={p.foto} nombre={p.nombre} grande />
                </button>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="text-xs text-gris">{p.codigo}</p>
                  <p className="line-clamp-2 text-sm leading-snug">{p.nombre}</p>
                  <p className="mt-auto text-sm font-medium tabular-nums">{p.precio != null ? pesosTxt(p.precio) : "Sin precio"}</p>
                  <button type="button" disabled={enCarrito.has(p.id) && p.tipo === "unica"} onClick={() => onAgregar(p)} className={clasesBoton("secundario", "min-h-10 w-full px-2")}>
                    {enCarrito.has(p.id) && p.tipo === "unica" ? "En la venta" : "Agregar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  );
}

function Ficha({ p, onCerrar, onAgregar }: { p: Pieza; onCerrar: () => void; onAgregar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/60 p-0 sm:items-center sm:p-6" role="dialog" aria-modal aria-label={p.nombre} onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-superficie sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <Miniatura foto={p.foto} nombre={p.nombre} grande />
        <div className="flex flex-col gap-2 p-5">
          <p className="text-xs tracking-widest text-gris uppercase">{p.codigo}</p>
          <h2 className="titulo-serif text-3xl leading-tight">{p.nombre}</h2>
          <p className="text-sm text-tinta-suave">{[p.metal, gramosTxt(p.pesoNetoMg), p.talle && `talle ${p.talle}`].filter(Boolean).join(" · ")}</p>
          <p className="titulo-serif text-3xl tabular-nums">{p.precio != null ? pesosTxt(p.precio) : "Sin precio"}</p>
          {p.porGramo && <p className="text-xs text-gris">Precio según el valor del gramo de hoy.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Boton type="button" variante="secundario" onClick={onCerrar}>Cerrar</Boton>
            <Boton type="button" onClick={onAgregar}>Agregar a la venta</Boton>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectorCliente({ cliente, onCambio }: { cliente: Cliente | null; onCambio: (c: Cliente | null) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Cliente[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [d, setD] = useState({ nombre: "", documento: "", whatsapp: "" });
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    const t = setTimeout(() => buscarClientes(q).then(setRes), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (cliente)
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gris">Cliente</p>
          <p className="font-medium">{cliente.nombre}</p>
          {cliente.saldo !== 0 && <p className={`text-xs ${cliente.saldo > 0 ? "text-error" : "text-ok"}`}>{cliente.saldo > 0 ? `Debe ${pesosTxt(cliente.saldo)}` : `Tiene ${pesosTxt(-cliente.saldo)} a favor`}</p>}
        </div>
        <button type="button" className="min-h-10 text-sm underline underline-offset-4" onClick={() => onCambio(null)}>Cambiar</button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Cliente <span className="font-normal text-gris">· consumidor final si no elegís</span></p>
        <button type="button" className="min-h-10 text-sm underline underline-offset-4" onClick={() => setNuevo(!nuevo)}>{nuevo ? "Buscar" : "+ Nuevo"}</button>
      </div>
      {!nuevo ? (
        <>
          <input className="campo" placeholder="Nombre, DNI/CUIT o WhatsApp" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
          {res.length > 0 && (
            <ul className="divide-y divide-linea rounded-lg border border-linea">
              {res.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-papel" onClick={() => onCambio(c)}>
                    <span>{c.nombre}{c.documento ? <span className="text-gris"> · {c.documento}</span> : null}</span>
                    {c.saldo !== 0 && <Etiqueta tono={c.saldo > 0 ? "error" : "ok"}>{c.saldo > 0 ? "Debe" : "A favor"} {pesosTxt(Math.abs(c.saldo))}</Etiqueta>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <input className="campo" placeholder="Nombre y apellido" aria-label="Nombre del cliente nuevo" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="campo" placeholder="DNI o CUIT" inputMode="numeric" aria-label="Documento del cliente nuevo" value={d.documento} onChange={(e) => setD({ ...d, documento: e.target.value })} />
            <input className="campo" placeholder="WhatsApp" inputMode="tel" aria-label="WhatsApp del cliente nuevo" value={d.whatsapp} onChange={(e) => setD({ ...d, whatsapp: e.target.value })} />
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Boton type="button" variante="secundario" onClick={() => iniciar(async () => {
            const r = await clienteRapido(d);
            if ("error" in r) setError(r.error ?? "Revisá los datos.");
            else { onCambio({ ...r, whatsapp: d.whatsapp }); setNuevo(false); }
          })}>Guardar cliente</Boton>
        </div>
      )}
    </div>
  );
}

function Extras({ servicios, usados, leyes, onServicio, onGift, onCanje }: { servicios: Servicio[]; usados: Set<string>; leyes: { id: number; nombre: string }[]; onServicio: (s: Servicio) => void; onGift: (monto: number) => void; onCanje: (c: Omit<Canje, "clave">) => void }) {
  const [abierto, setAbierto] = useState<"servicio" | "gift" | "canje" | null>(null);
  const [gift, setGift] = useState("");
  const [canje, setCanje] = useState<Omit<Canje, "clave">>({ leyId: leyes[0]?.id ?? 0, gramos: "", descripcion: "", destino: "metal" });
  const disponibles = servicios.filter((s) => !usados.has(s.ref));
  const boton = (k: typeof abierto, t: string) => (
    <button type="button" onClick={() => setAbierto(abierto === k ? null : k)} className={`min-h-11 rounded-full border px-4 text-sm ${abierto === k ? "border-tinta bg-tinta text-white" : "border-linea-fuerte bg-superficie"}`}>{t}</button>
  );
  return (
    <Tarjeta className="p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {boton("servicio", "Cobrar reparación o pedido")}
        {boton("gift", "Vender gift card")}
        {boton("canje", "Recibir metal (canje)")}
      </div>
      {abierto === "servicio" && (
        <ul className="mt-3 divide-y divide-linea rounded-lg border border-linea">
          {disponibles.map((s) => (
            <li key={s.ref} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{s.texto}{!s.listo && <span className="ml-1 text-xs text-alerta">(todavía no está lista)</span>}</span>
              <button type="button" className={clasesBoton("secundario", "min-h-10 px-3")} onClick={() => { onServicio(s); setAbierto(null); }}>Agregar</button>
            </li>
          ))}
          {!disponibles.length && <li className="px-3 py-4 text-center text-sm text-gris">No hay reparaciones ni pedidos para cobrar{servicios.length ? "" : " de este cliente"}.</li>}
        </ul>
      )}
      {abierto === "gift" && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const m = aCentavos(gift); if (m > 0) { onGift(m); setGift(""); setAbierto(null); } }}>
          <input className="campo flex-1" inputMode="decimal" placeholder="Monto de la gift card $" aria-label="Monto de la gift card" value={gift} onChange={(e) => setGift(e.target.value)} />
          <Boton variante="secundario">Agregar</Boton>
        </form>
      )}
      {abierto === "canje" && (
        <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); if (aCentavos(canje.gramos) > 0) { onCanje(canje); setCanje({ ...canje, gramos: "", descripcion: "" }); setAbierto(null); } }}>
          <select className="campo" aria-label="Ley del metal" value={canje.leyId} onChange={(e) => setCanje({ ...canje, leyId: Number(e.target.value) })}>
            {leyes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <input className="campo" inputMode="decimal" placeholder="Gramos" aria-label="Gramos del canje" value={canje.gramos} onChange={(e) => setCanje({ ...canje, gramos: e.target.value })} />
          <input className="campo col-span-2" placeholder="Qué entrega (ej.: cadena rota, alianza)" aria-label="Descripción del canje" value={canje.descripcion} onChange={(e) => setCanje({ ...canje, descripcion: e.target.value })} />
          <select className="campo" aria-label="Destino del canje" value={canje.destino} onChange={(e) => setCanje({ ...canje, destino: e.target.value as "metal" | "pieza" })}>
            <option value="metal">A fundición (metal)</option>
            <option value="pieza">Pieza usada para revender</option>
          </select>
          <Boton variante="secundario">Agregar canje</Boton>
          <p className="col-span-2 text-xs text-gris">Se toma al precio de compra del gramo de esa ley (Configuración → Cotizaciones).</p>
        </form>
      )}
    </Tarjeta>
  );
}

function PanelReserva({ carrito, cliente, medios, cot, dias, onVolver, onListo }: { carrito: Carrito; cliente: Cliente | null; medios: MedioCliente[]; cot: { USD: number | null; EUR: number | null }; dias: number; onVolver: () => void; onListo: (id: number) => void }) {
  const [d, setD] = useState({ dias, congelado: true, conSena: false });
  const [sena, setSena] = useState("");
  const [pagos, setPagos] = useState<PagoEnviado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <Tarjeta className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Reservar</h2>
        <button type="button" className="text-sm underline underline-offset-4" onClick={onVolver}>← Volver</button>
      </div>
      {!cliente && <Aviso tono="error">Para reservar elegí el cliente arriba.</Aviso>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gris">Días de reserva<input type="number" min={1} max={365} className="campo" value={d.dias} onChange={(e) => setD({ ...d, dias: Number(e.target.value) })} /></label>
        <label className="flex flex-col gap-1 text-xs text-gris">Precio
          <select className="campo" value={d.congelado ? "1" : "0"} onChange={(e) => setD({ ...d, congelado: e.target.value === "1" })}>
            <option value="1">Se respeta el de hoy</option>
            <option value="0">El del día del retiro</option>
          </select>
        </label>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={d.conSena} onChange={(e) => setD({ ...d, conSena: e.target.checked })} /> Deja seña</label>
      {d.conSena && (
        <div className="mt-2 flex flex-col gap-3">
          <input className="campo" inputMode="decimal" placeholder="Importe de la seña $" aria-label="Importe de la seña" value={sena} onChange={(e) => setSena(e.target.value)} />
          {aCentavos(sena) > 0 && <PanelPagos total={aCentavos(sena)} medios={medios} cot={cot} onCambio={(p) => setPagos(p)} />}
        </div>
      )}
      {error && <div className="mt-3"><Aviso tono="error">{error}</Aviso></div>}
      <Boton type="button" className="mt-4 w-full" disabled={!cliente || enviando} onClick={() => iniciar(async () => {
        setError(null);
        const r = await reservar(carrito, { dias: d.dias, precioCongelado: d.congelado, sena: d.conSena ? pagos : [] });
        if (r.ok) onListo(r.id);
        else setError(r.error);
      })}>Confirmar reserva</Boton>
    </Tarjeta>
  );
}

function Listo({ hecho, cliente }: { hecho: Hecho; cliente: Cliente | null }) {
  const titulo = hecho.tipo === "venta" ? `Venta N.º ${String(hecho.numero).padStart(6, "0")} registrada` : hecho.tipo === "presupuesto" ? "Presupuesto guardado" : `Reserva N.º ${hecho.id} confirmada`;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 py-6 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-ok-suave text-3xl text-ok" aria-hidden>✓</div>
      <h1 className="titulo-serif text-3xl" role="status">{titulo}</h1>
      {cliente && <p className="text-sm text-gris">{cliente.nombre}</p>}
      {hecho.fiscal?.ok && <Aviso tono="ok">{hecho.fiscal.ok}</Aviso>}
      {hecho.fiscal?.aviso && <Aviso tono="alerta">{hecho.fiscal.aviso}</Aviso>}
      {hecho.fiscal?.error && <Aviso tono="error">{hecho.fiscal.error} La venta quedó registrada: corregí el dato y reintentá desde la venta.</Aviso>}
      <div className="grid gap-2 sm:grid-cols-2">
        {hecho.tipo === "venta" && (
          <>
            {hecho.fiscal?.id ? <a href={`/documentos/factura/${hecho.fiscal.id}`} target="_blank" className={clasesBoton("primario")}>Factura (PDF)</a> : <a href={`/documentos/comprobante/${hecho.id}`} target="_blank" className={clasesBoton("primario")}>Comprobante (PDF)</a>}
            <a href={`/documentos/garantia/${hecho.id}`} target="_blank" className={clasesBoton("secundario")}>Certificado de garantía</a>
            <a href={`/documentos/remito/${hecho.id}`} target="_blank" className={clasesBoton("secundario")}>Remito</a>
            <Link href={`/ventas/${hecho.id}`} className={clasesBoton("secundario")}>Ver la venta / WhatsApp</Link>
          </>
        )}
        {hecho.tipo === "presupuesto" && (
          <>
            <a href={`/documentos/presupuesto/${hecho.id}`} target="_blank" className={clasesBoton("primario")}>Presupuesto (PDF)</a>
            <Link href="/ventas/presupuestos" className={clasesBoton("secundario")}>Ver presupuestos</Link>
          </>
        )}
        {hecho.tipo === "reserva" && <Link href="/ventas/reservas" className={clasesBoton("secundario", "sm:col-span-2")}>Ver reservas</Link>}
      </div>
      <a href="/mostrador" className={clasesBoton("fantasma")}>Nueva venta</a>
    </div>
  );
}

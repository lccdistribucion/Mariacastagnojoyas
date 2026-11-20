"use client";
/**
 * Panel de cobro: uno o varios medios en la misma operación. Muestra el recargo o descuento de cada medio, lo que
 * hay que recibir en dólares/euros y el vuelto del efectivo. Los cálculos finales los hace siempre el servidor.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type MedioCliente = { id: number; nombre: string; tipo: string; moneda: string; ajustePct: number; planes: { cuotas: number; recargoPct: number }[] };
export type Sena = { ref: string; disponible: number; etiqueta?: string };
export type PagoEnviado = { medioId: number; aplicado: number; cuotas?: number | null; valeCodigo?: string | null; tipoCambio?: number | null; planCc?: number | null; senaRef?: string | null };

type Fila = { clave: number; medioId: number; importe: string; cuotas: number; vale: string; tc: string; planCc: number; senaRef: string; pagaCon: string; tocado: boolean };

export const pesosTxt = (c: number) => `$ ${(c / 100).toLocaleString("es-AR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** «1.560,50» o «1560.5» → centavos. */
export function aCentavos(t: string): number {
  const s = t.trim().replace(/\s|\$/g, "");
  if (!s) return 0;
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
  else n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
const aTexto = (c: number) => (c ? (c / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "");

let siguiente = 1;

export function PanelPagos({
  total,
  medios,
  cot,
  senas = [],
  saldoFavor = 0,
  ventas = false,
  conCliente = false,
  nombre,
  onCambio,
  inicial,
}: {
  /** Lo que hay que cubrir, en centavos (sin recargos). */
  total: number;
  medios: MedioCliente[];
  cot: { USD: number | null; EUR: number | null };
  senas?: Sena[];
  /** Saldo a favor general del cliente (positivo). */
  saldoFavor?: number;
  /** En ventas se puede usar cuenta corriente y saldo a favor; en señas y cobros, no. */
  ventas?: boolean;
  conCliente?: boolean;
  /** Si se indica, los pagos viajan en un campo oculto con ese nombre (para formularios). */
  nombre?: string;
  onCambio?: (p: PagoEnviado[], recargos: number, falta: number) => void;
  /** Medio con el que arranca (por defecto efectivo); vacío = arranca sin filas. */
  inicial?: "vacio";
}) {
  const usables = useMemo(() => medios.filter((m) => ventas || !["cuenta_corriente", "saldo_favor"].includes(m.tipo)), [medios, ventas]);
  const nueva = (medioId: number, importe: number): Fila => ({ clave: siguiente++, medioId, importe: aTexto(importe), cuotas: 1, vale: "", tc: "", planCc: 1, senaRef: "", pagaCon: "", tocado: false });
  const efectivo = usables.find((m) => m.tipo === "efectivo" && m.moneda === "ARS") ?? usables[0];
  const [filas, setFilas] = useState<Fila[]>(() => (inicial === "vacio" || !efectivo ? [] : [nueva(efectivo.id, total)]));

  // Si cambia el total y hay un solo pago que nadie tocó, lo acompaña.
  useEffect(() => {
    setFilas((f) => (f.length === 1 && !f[0].tocado ? [{ ...f[0], importe: aTexto(total) }] : f));
  }, [total]);

  const medio = (id: number) => medios.find((m) => m.id === id);
  const calc = filas.map((f) => {
    const m = medio(f.medioId);
    const aplicado = aCentavos(f.importe);
    const plan = m?.tipo === "credito" ? m.planes.find((p) => p.cuotas === f.cuotas) : null;
    const ajuste = (m?.ajustePct ?? 0) + (plan?.recargoPct ?? 0);
    const recargo = Math.round((aplicado * ajuste) / 10000);
    const tc = m && m.moneda !== "ARS" ? aCentavos(f.tc) / 100 || (m.moneda === "USD" ? cot.USD : cot.EUR) || 0 : 1;
    const enMoneda = m && m.moneda !== "ARS" && tc ? Math.round((aplicado + recargo) / tc) : null;
    return { f, m, aplicado, recargo, ajuste, tc, enMoneda };
  });
  const aplicado = calc.reduce((s, c) => s + c.aplicado, 0);
  const recargos = calc.reduce((s, c) => s + c.recargo, 0);
  const falta = total - aplicado;
  const pagos: PagoEnviado[] = calc
    .filter((c) => c.m && c.aplicado > 0)
    .map(({ f, m, aplicado }) => ({
      medioId: f.medioId,
      aplicado,
      cuotas: m!.tipo === "credito" ? f.cuotas : null,
      valeCodigo: m!.tipo === "vale" ? f.vale.trim().toUpperCase() : null,
      tipoCambio: m!.moneda !== "ARS" && f.tc ? aCentavos(f.tc) / 100 : null,
      planCc: m!.tipo === "cuenta_corriente" ? f.planCc : null,
      senaRef: m!.tipo === "saldo_favor" && f.senaRef ? f.senaRef : null,
    }));
  const json = JSON.stringify(pagos);
  const ultimo = useRef("");
  useEffect(() => {
    const clave = `${json}|${recargos}|${falta}`;
    if (clave === ultimo.current) return;
    ultimo.current = clave;
    onCambio?.(pagos, recargos, falta);
  });

  const cambiar = (clave: number, d: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, tocado: true, ...d } : f)));
  const agregar = () => {
    const usados = new Set(filas.map((f) => f.medioId));
    const m = usables.find((x) => !usados.has(x.id)) ?? usables[0];
    setFilas((fs) => [...fs.map((f) => ({ ...f, tocado: true })), nueva(m.id, Math.max(0, falta))]);
  };

  return (
    <div className="flex flex-col gap-3">
      {nombre && <input type="hidden" name={nombre} value={json} />}
      {calc.map(({ f, m, recargo, ajuste, enMoneda, tc, aplicado: ap }, i) => (
        <div key={f.clave} className="rounded-lg border border-linea bg-papel/60 p-3">
          <div className="grid grid-cols-[1fr_8.5rem_auto] items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gris">
              Medio
              <select
                className="campo"
                aria-label={`Medio de pago ${i + 1}`}
                value={f.medioId}
                onChange={(e) => {
                  const nuevo = medio(Number(e.target.value));
                  const sena = nuevo?.tipo === "saldo_favor" && senas[0] ? senas[0] : null;
                  cambiar(f.clave, { medioId: Number(e.target.value), senaRef: sena?.ref ?? "", ...(sena && filas.length === 1 ? { importe: aTexto(Math.min(sena.disponible, total)) } : {}) });
                }}
              >
                {usables.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                    {x.ajustePct ? ` (${x.ajustePct > 0 ? "+" : ""}${x.ajustePct / 100} %)` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gris">
              Importe $
              <input className="campo text-right tabular-nums" inputMode="decimal" aria-label={`Importe del pago ${i + 1}`} value={f.importe} onChange={(e) => cambiar(f.clave, { importe: e.target.value })} />
            </label>
            <button type="button" className="min-h-11 rounded-lg px-2 text-gris hover:text-error disabled:opacity-30" aria-label="Quitar este pago" disabled={filas.length === 1} onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}>
              ✕
            </button>
          </div>

          {m?.tipo === "credito" && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Cuotas">
              {m.planes.map((p) => (
                <button key={p.cuotas} type="button" onClick={() => cambiar(f.clave, { cuotas: p.cuotas })} className={`min-h-10 rounded-full border px-3 text-sm ${f.cuotas === p.cuotas ? "border-tinta bg-tinta text-white" : "border-linea-fuerte bg-superficie"}`}>
                  {p.cuotas === 1 ? "1 pago" : `${p.cuotas} cuotas`}
                  {p.recargoPct ? ` +${p.recargoPct / 100} %` : ""}
                </button>
              ))}
            </div>
          )}
          {m?.tipo === "vale" && <input className="campo mt-2 uppercase placeholder:normal-case" placeholder="Código del vale o gift card (GC-… / VL-…)" aria-label="Código del vale" value={f.vale} onChange={(e) => cambiar(f.clave, { vale: e.target.value })} />}
          {m?.tipo === "cuenta_corriente" && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              Plan
              <select className="campo w-auto" value={f.planCc} onChange={(e) => cambiar(f.clave, { planCc: Number(e.target.value) })} aria-label="Plan de cuenta corriente">
                {[1, 2, 3, 4, 5, 6, 9, 10, 12].map((n) => (
                  <option key={n} value={n}>{n === 1 ? "Un solo vencimiento (a 30 días)" : `${n} cuotas mensuales de ${pesosTxt(Math.floor(ap / n))}`}</option>
                ))}
              </select>
            </label>
          )}
          {m?.tipo === "cuenta_corriente" && !conCliente && <p className="mt-1 text-xs text-error">Elegí el cliente para dejar en cuenta corriente.</p>}
          {m?.tipo === "saldo_favor" && (
            <select className="campo mt-2" value={f.senaRef} onChange={(e) => cambiar(f.clave, { senaRef: e.target.value })} aria-label="Qué seña se usa">
              {senas.map((s) => (
                <option key={s.ref} value={s.ref}>{s.etiqueta ?? `Seña ${s.ref}`} · disponible {pesosTxt(s.disponible)}</option>
              ))}
              <option value="">Saldo a favor general{conCliente ? ` · disponible ${pesosTxt(Math.max(0, saldoFavor))}` : ""}</option>
            </select>
          )}
          {m && m.moneda !== "ARS" && (
            <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-gris">
                Cambio (pesos por {m.moneda === "USD" ? "dólar" : "euro"})
                <input className="campo text-right tabular-nums" inputMode="decimal" placeholder={tc ? tc.toLocaleString("es-AR") : "Sin cotización"} value={f.tc} onChange={(e) => cambiar(f.clave, { tc: e.target.value })} />
              </label>
              <p className="pb-2 text-right text-sm">
                Recibís <strong className="tabular-nums">{m.moneda === "USD" ? "US$" : "€"} {enMoneda != null ? (enMoneda / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}</strong>
              </p>
            </div>
          )}
          {m?.tipo === "efectivo" && m.moneda === "ARS" && (
            <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-gris">
                Paga con (para calcular el vuelto)
                <input className="campo text-right tabular-nums" inputMode="decimal" value={f.pagaCon} onChange={(e) => cambiar(f.clave, { pagaCon: e.target.value })} />
              </label>
              <p className="pb-2 text-right text-sm">{aCentavos(f.pagaCon) > ap + recargo ? <>Vuelto <strong className="tabular-nums">{pesosTxt(aCentavos(f.pagaCon) - ap - recargo)}</strong></> : null}</p>
            </div>
          )}
          {recargo !== 0 && (
            <p className={`mt-2 text-xs ${recargo > 0 ? "text-alerta" : "text-ok"}`}>
              {recargo > 0 ? "Recargo" : "Descuento"} {Math.abs(ajuste) / 100} %: {recargo > 0 ? "+" : "−"}{pesosTxt(Math.abs(recargo))} → se cobran {pesosTxt(ap + recargo)}
            </p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={agregar} className="min-h-11 rounded-lg px-2 text-sm font-medium underline underline-offset-4">
          + Pagar con otro medio
        </button>
        <p className={`text-sm font-medium tabular-nums ${falta === 0 ? "text-ok" : "text-error"}`} role="status">
          {falta === 0 ? "Cubierto" : falta > 0 ? `Falta ${pesosTxt(falta)}` : `Sobra ${pesosTxt(-falta)}`}
        </p>
      </div>
      {recargos !== 0 && <p className="text-right text-sm">Total a cobrar con {recargos > 0 ? "recargos" : "descuentos"}: <strong className="tabular-nums">{pesosTxt(total + recargos)}</strong></p>}
    </div>
  );
}

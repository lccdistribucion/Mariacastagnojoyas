/**
 * Conciliación bancaria: se importa el extracto (Excel o CSV), el sistema propone qué renglón corresponde a qué
 * movimiento (mismo importe, fecha cercana), se confirman y quedan marcados como conciliados. Lo que no coincide
 * se lista para revisar (y un renglón del banco sin movimiento —por ejemplo una comisión— se puede registrar).
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { cajas, db, extractoLineas, movimientosCaja } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { leerNumero } from "../formato";
import { leerMatriz } from "../stock/importar";
import { formatoMoneda, movimiento } from "./cajas";

export type RenglonExtracto = { fecha: string; descripcion: string; importe: number };
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function leerFecha(t: string): string | null {
  const s = t.trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Reconoce las columnas habituales: Fecha, Descripción/Concepto, Importe (o Débito y Crédito). */
export async function leerExtracto(nombre: string, contenido: Buffer): Promise<RenglonExtracto[]> {
  const matriz = await leerMatriz(nombre, contenido);
  const iEnc = matriz.findIndex((f) => f.some((c) => sinTildes(c) === "fecha"));
  if (iEnc < 0) throw new ErrorValidacion("No encontré la fila de encabezados (tiene que tener una columna «Fecha»).");
  const enc = matriz[iEnc].map(sinTildes);
  const col = (...nombres: string[]) => enc.findIndex((c) => nombres.some((n) => c === n || c.startsWith(n)));
  const cFecha = col("fecha");
  const cDesc = col("descripcion", "concepto", "detalle", "movimiento", "referencia");
  const cImp = col("importe", "monto");
  const cDeb = col("debito", "debe", "egreso");
  const cCred = col("credito", "haber", "ingreso");
  if (cImp < 0 && (cDeb < 0 || cCred < 0)) throw new ErrorValidacion("Falta la columna «Importe» (o las columnas «Débito» y «Crédito»).");
  const out: RenglonExtracto[] = [];
  for (const f of matriz.slice(iEnc + 1)) {
    const fecha = leerFecha(f[cFecha] ?? "");
    if (!fecha) continue;
    const num = (i: number) => (i < 0 ? 0 : (leerNumero((f[i] ?? "").replace(/\$|\s/g, "")) ?? 0));
    const importe = Math.round((cImp >= 0 ? num(cImp) : num(cCred) - Math.abs(num(cDeb))) * 100);
    if (!importe) continue;
    out.push({ fecha, descripcion: (cDesc >= 0 ? f[cDesc] : "").trim() || "(sin detalle)", importe });
  }
  if (!out.length) throw new ErrorValidacion("El archivo no tiene renglones con fecha e importe.");
  return out;
}

/** Propone, para cada renglón, el movimiento del sistema de igual importe y fecha más cercana (hasta 5 días). */
export async function proponer(cajaId: number, renglones: RenglonExtracto[]) {
  const movs = await db.select().from(movimientosCaja).where(and(eq(movimientosCaja.cajaId, cajaId), eq(movimientosCaja.anulado, false), eq(movimientosCaja.conciliado, false))).orderBy(asc(movimientosCaja.fecha));
  const usados = new Set<number>();
  const dias = (a: Date, b: string) => Math.abs(a.getTime() - new Date(`${b}T12:00:00-03:00`).getTime()) / 86400_000;
  // Desempate: se prefiere el movimiento que comparte alguna palabra con el renglón (un número de cheque, un nombre).
  const palabras = (t: string) => new Set(sinTildes(t).split(/[^a-z0-9-]+/).filter((w) => w.length >= 3));
  const puntaje = (m: (typeof movs)[number], r: RenglonExtracto) => {
    const a = palabras(r.descripcion);
    const comparte = [...palabras(m.descripcion)].some((w) => a.has(w));
    return dias(m.fecha, r.fecha) + (comparte ? 0 : 0.9);
  };
  const propuestas = renglones.map((r) => {
    const candidatos = movs.filter((m) => !usados.has(m.id) && m.importe === r.importe && dias(m.fecha, r.fecha) <= 5).sort((a, b) => puntaje(a, r) - puntaje(b, r));
    const m = candidatos[0];
    if (m) usados.add(m.id);
    return { ...r, movimiento: m ? { id: m.id, fecha: m.fecha.toISOString(), descripcion: m.descripcion } : null };
  });
  const sinExtracto = movs.filter((m) => !usados.has(m.id)).map((m) => ({ id: m.id, fecha: m.fecha.toISOString(), descripcion: m.descripcion, importe: m.importe }));
  return { propuestas, sinExtracto };
}

/** Guarda el extracto y marca conciliados los movimientos confirmados. */
export async function confirmarConciliacion(cajaId: number, renglones: (RenglonExtracto & { movimientoId: number | null })[], actor: Actor) {
  if (!renglones.length) throw new ErrorValidacion("No hay renglones para guardar.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(cajas).where(eq(cajas.id, cajaId));
    if (!c || c.tipo !== "banco") throw new ErrorValidacion("Elegí la cuenta bancaria.");
    const lote = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`;
    const ahora = new Date();
    const ids = renglones.map((r) => r.movimientoId).filter((x): x is number => x != null);
    if (new Set(ids).size !== ids.length) throw new ErrorValidacion("Un movimiento quedó asignado a dos renglones.");
    if (ids.length) {
      const movs = await tx.select().from(movimientosCaja).where(inArray(movimientosCaja.id, ids));
      for (const r of renglones.filter((x) => x.movimientoId)) {
        const m = movs.find((x) => x.id === r.movimientoId);
        if (!m || m.cajaId !== cajaId || m.anulado || m.conciliado || m.importe !== r.importe) throw new ErrorValidacion("Uno de los movimientos ya no se puede conciliar (cambió o ya está conciliado). Volvé a subir el extracto.");
      }
      await tx.update(movimientosCaja).set({ conciliado: true, conciliadoEn: ahora }).where(inArray(movimientosCaja.id, ids));
    }
    for (const r of renglones) await tx.insert(extractoLineas).values({ cajaId, importacion: lote, fecha: new Date(`${r.fecha}T12:00:00-03:00`), descripcion: r.descripcion.slice(0, 200), importe: r.importe, movimientoId: r.movimientoId, creadoEn: ahora });
    await auditar(tx, actor, { accion: "alta", entidad: "movimiento_caja", descripcion: `Concilió «${c.nombre}»: ${ids.length} de ${renglones.length} renglones del extracto coinciden` });
    return { conciliados: ids.length, pendientes: renglones.length - ids.length };
  });
}

/** Renglones del banco que no tienen movimiento en el sistema. */
export const lineasPendientes = (cajaId: number) => db.select().from(extractoLineas).where(and(eq(extractoLineas.cajaId, cajaId), isNull(extractoLineas.movimientoId))).orderBy(desc(extractoLineas.fecha));

/** Registra un renglón del banco que faltaba en el sistema (comisión, impuesto, interés…) y lo deja conciliado. */
export async function registrarLinea(lineaId: number, categoriaId: number, actor: Actor) {
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(extractoLineas).where(eq(extractoLineas.id, lineaId));
    if (!l || l.movimientoId) throw new ErrorValidacion("Ese renglón ya está registrado.");
    const { id, caja } = await movimiento(tx, { cajaId: l.cajaId, tipo: l.importe < 0 ? "gasto" : "ingreso", importe: l.importe, descripcion: `Según extracto: ${l.descripcion}`, categoriaId, fecha: l.fecha }, actor);
    await tx.update(movimientosCaja).set({ conciliado: true, conciliadoEn: new Date() }).where(eq(movimientosCaja.id, id));
    await tx.update(extractoLineas).set({ movimientoId: id }).where(eq(extractoLineas.id, lineaId));
    await auditar(tx, actor, { accion: "alta", entidad: "movimiento_caja", entidadId: id, descripcion: `Registró desde el extracto de «${caja.nombre}»: ${l.descripcion} ${formatoMoneda(l.importe, caja.moneda)}` });
  });
}

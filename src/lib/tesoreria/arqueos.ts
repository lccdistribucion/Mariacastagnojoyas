/**
 * Apertura y cierre diario de las cajas de efectivo. Se cuenta lo que hay; el sistema compara con lo esperado
 * (saldo según los movimientos) y la diferencia queda registrada como movimiento «Diferencia de arqueo», con
 * quién contó y cuándo. Un día por caja: una apertura y un cierre.
 */
import { and, asc, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { arqueos, cajas, db, usuarios } from "@/db";
import { crearAlerta } from "../alertas";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { hoyIso } from "../formato";
import { formatoMoneda, movimiento, saldoCaja } from "./cajas";

export async function estadoDelDia(dia = hoyIso()) {
  const cs = await db.select().from(cajas).where(and(eq(cajas.arqueo, true), eq(cajas.activa, true))).orderBy(asc(cajas.orden));
  const filas = await db.select().from(arqueos).where(eq(arqueos.dia, dia));
  return Promise.all(cs.map(async (c) => ({ caja: c, esperado: await saldoCaja(c.id), arqueo: filas.find((a) => a.cajaId === c.id) ?? null })));
}

async function contar(cajaId: number, contado: number, momento: "apertura" | "cierre", notas: string, actor: Actor) {
  if (!Number.isInteger(contado) || contado < 0) throw new ErrorValidacion("Escribí cuánto hay contado (puede ser 0).");
  const dia = hoyIso();
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(cajas).where(eq(cajas.id, cajaId));
    if (!c || !c.arqueo || !c.activa) throw new ErrorValidacion("Esa caja no lleva apertura y cierre.");
    const [a] = await tx.select().from(arqueos).where(and(eq(arqueos.cajaId, cajaId), eq(arqueos.dia, dia)));
    if (momento === "apertura" && a?.aperturaEn) throw new ErrorValidacion(`«${c.nombre}» ya se abrió hoy.`);
    if (a?.cierreEn) throw new ErrorValidacion(`«${c.nombre}» ya se cerró hoy.`);
    const esperado = await saldoCaja(cajaId, tx);
    const diferencia = contado - esperado;
    const ahora = new Date();
    if (diferencia !== 0)
      await movimiento(tx, { cajaId, tipo: "arqueo", importe: diferencia, descripcion: `${diferencia > 0 ? "Sobrante" : "Faltante"} en la ${momento} del ${dia.split("-").reverse().join("/")}${notas.trim() ? ` (${notas.trim()})` : ""}`, referencia: `arqueo:${dia}` }, actor);
    const datos = momento === "apertura" ? { aperturaEn: ahora, aperturaUsuarioId: actor.id, esperadoApertura: esperado, contadoApertura: contado } : { cierreEn: ahora, cierreUsuarioId: actor.id, esperadoCierre: esperado, contadoCierre: contado };
    const nota = notas.trim() ? [a?.notas, notas.trim()].filter(Boolean).join(" · ") : (a?.notas ?? null);
    if (a) await tx.update(arqueos).set({ ...datos, notas: nota }).where(eq(arqueos.id, a.id));
    else await tx.insert(arqueos).values({ cajaId, dia, ...datos, notas: nota });
    await auditar(tx, actor, {
      accion: "alta",
      entidad: "arqueo",
      entidadId: cajaId,
      descripcion: `${momento === "apertura" ? "Abrió" : "Cerró"} «${c.nombre}»: contado ${formatoMoneda(contado, c.moneda)}, esperado ${formatoMoneda(esperado, c.moneda)}${diferencia ? `, ${diferencia > 0 ? "sobrante" : "faltante"} ${formatoMoneda(Math.abs(diferencia), c.moneda)}` : ", sin diferencia"}`,
    });
    if (diferencia !== 0) await crearAlerta({ tipo: "arqueo_diferencia", nivel: "alerta", titulo: `${diferencia > 0 ? "Sobrante" : "Faltante"} de ${formatoMoneda(Math.abs(diferencia), c.moneda)} en «${c.nombre}»`, detalle: `En la ${momento} de hoy (contó ${actor.nombre}).${notas.trim() ? ` Nota: ${notas.trim()}` : ""}`, clave: `arqueo:${cajaId}:${dia}:${momento}` }, tx);
    return { esperado, diferencia };
  });
}

export const abrirCaja = (cajaId: number, contado: number, notas: string, actor: Actor) => contar(cajaId, contado, "apertura", notas, actor);
export const cerrarCaja = (cajaId: number, contado: number, notas: string, actor: Actor) => contar(cajaId, contado, "cierre", notas, actor);

export async function historialArqueos(desde: string) {
  return db
    .select({ a: arqueos, caja: cajas.nombre, moneda: cajas.moneda, abrio: usuarios.nombre })
    .from(arqueos)
    .innerJoin(cajas, eq(cajas.id, arqueos.cajaId))
    .leftJoin(usuarios, eq(usuarios.id, arqueos.aperturaUsuarioId))
    .where(gte(arqueos.dia, desde))
    .orderBy(desc(arqueos.dia), asc(cajas.orden))
    .limit(400);
}

/** Tarea diaria: avisa si alguna caja quedó abierta sin cerrar el día anterior. */
export async function avisarCajasSinCerrar(hoy: string) {
  const abiertas = await db.select({ dia: arqueos.dia, caja: cajas.nombre }).from(arqueos).innerJoin(cajas, eq(cajas.id, arqueos.cajaId)).where(and(lt(arqueos.dia, hoy), isNull(arqueos.cierreEn)));
  const recientes = abiertas.filter((a) => a.dia >= hoyIso(new Date(Date.now() - 7 * 86400_000)));
  if (recientes.length) await crearAlerta({ tipo: "caja_sin_cerrar", nivel: "alerta", titulo: `${recientes.length} caja/s quedaron abiertas sin cerrar`, detalle: recientes.map((a) => `${a.caja} (${a.dia.split("-").reverse().join("/")})`).join(" · "), clave: `caja_sin_cerrar:${hoy}` });
}

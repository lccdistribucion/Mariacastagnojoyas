/**
 * Tareas automáticas. Corren dentro del mismo servidor (se encienden solas al abrir el sistema; ver
 * `src/instrumentation.ts`). Cada minuto se fija qué toca:
 *  - Cotizaciones: en horario comercial cada N minutos (configurable), fuera de horario cada M minutos.
 *  - Historial: si la base no tiene cotizaciones, trae el último año (una vez).
 *  - Copia de seguridad diaria a la hora configurada (si la PC estaba apagada, la hace al encenderla).
 * Un error en una tarea queda como aviso para el administrador y nunca frena las ventas.
 */
import { desc } from "drizzle-orm";
import { actualizacionesCotizacion, db } from "@/db";
import { crearAlerta } from "./alertas";
import { auditar, SISTEMA } from "./auditoria";
import { copiaDiaria, hayCopiaDiariaHoy } from "./backup";
import { leerConfig } from "./config";
import { actualizarCotizaciones } from "./cotizaciones/actualizar";
import { importarHistorial } from "./cotizaciones/historial";
import { hayCotizaciones } from "./cotizaciones/vigentes";
import { hoyIso, ZONA } from "./formato";
import { salidasVencidas, sinMovimiento, stockBajo } from "./stock/consultas";
import { avisosPedidos } from "./taller/pedidos";
import { avisosReparaciones } from "./taller/reparaciones";
import { avisosTesoreria } from "./tesoreria/avisos";
import { avisosFacturacion } from "./facturacion/avisos";
import { vencerReservas } from "./ventas/reservas";

/** Día de la semana (1 = lunes … 7 = domingo) y hora «HH:MM» en Argentina. */
export function momentoArgentina(d = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const dia = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(partes.find((p) => p.type === "weekday")!.value) + 1;
  const hh = partes.find((p) => p.type === "hour")!.value.replace("24", "00");
  const mm = partes.find((p) => p.type === "minute")!.value;
  return { dia, hora: `${hh}:${mm}` };
}

/** Minutos entre actualizaciones según el momento (pura: se prueba sola). */
export function frecuenciaAhora(
  cfg: { frecuencia: number; fuera: number; desde: string; hasta: string; dias: number[] },
  momento: { dia: number; hora: string },
) {
  const enHorario = cfg.dias.includes(momento.dia) && momento.hora >= cfg.desde && momento.hora < cfg.hasta;
  return enHorario ? cfg.frecuencia : cfg.fuera;
}

let ocupado = false;

export async function ciclo(ahora = new Date()) {
  if (ocupado) return;
  ocupado = true;
  try {
    const cfg = await leerConfig([
      "cotizaciones.frecuencia_minutos",
      "cotizaciones.frecuencia_fuera_horario",
      "cotizaciones.horario_desde",
      "cotizaciones.horario_hasta",
      "cotizaciones.dias",
      "backup.hora",
      "backup.conservar",
      "backup.carpeta_extra",
    ]);

    // Historial inicial (solo si no hay ninguna cotización, y no en modo simulado de pruebas).
    if (process.env.COTIZACIONES_SIMULADAS !== "1" && !(await hayCotizaciones())) {
      try {
        await importarHistorial(365);
      } catch (e) {
        console.error("[tareas] historial:", e);
      }
    }

    // Cotizaciones
    const minutos = frecuenciaAhora(
      {
        frecuencia: cfg["cotizaciones.frecuencia_minutos"],
        fuera: cfg["cotizaciones.frecuencia_fuera_horario"],
        desde: cfg["cotizaciones.horario_desde"],
        hasta: cfg["cotizaciones.horario_hasta"],
        dias: cfg["cotizaciones.dias"],
      },
      momentoArgentina(ahora),
    );
    const [ultima] = await db.select({ fecha: actualizacionesCotizacion.fecha }).from(actualizacionesCotizacion).orderBy(desc(actualizacionesCotizacion.fecha)).limit(1);
    if (!ultima || ahora.getTime() - ultima.fecha.getTime() >= minutos * 60_000 - 20_000) {
      await actualizarCotizaciones("automatica");
    }

    // Avisos de stock (uno por día de cada tipo; si no hay nada, no avisa).
    const hoy = hoyIso(ahora);
    const [bajos, quietas, atrasadas] = await Promise.all([stockBajo(), sinMovimiento(), salidasVencidas()]);
    const lista = (xs: { codigo: string; nombre: string }[]) => xs.slice(0, 12).map((x) => `${x.codigo} ${x.nombre}`).join(" · ") + (xs.length > 12 ? ` y ${xs.length - 12} más` : "");
    if (bajos.length)
      await crearAlerta({ tipo: "stock_bajo", nivel: "alerta", titulo: `Stock bajo: ${bajos.length} ${bajos.length === 1 ? "artículo" : "artículos"}`, detalle: lista(bajos), clave: `stock_bajo:${hoy}` });
    if (atrasadas.length)
      await crearAlerta({ tipo: "salida_atrasada", nivel: "error", titulo: `${atrasadas.length} ${atrasadas.length === 1 ? "pieza no volvió" : "piezas no volvieron"} al local en fecha`, detalle: atrasadas.map((x) => `${x.codigo} (${x.s.detalle})`).join(" · "), clave: `salida_atrasada:${hoy}` });
    // Las piezas quietas se avisan una vez por semana (los lunes).
    if (quietas.length && momentoArgentina(ahora).dia === 1)
      await crearAlerta({ tipo: "sin_movimiento", nivel: "info", titulo: `${quietas.length} piezas sin movimiento hace meses`, detalle: lista(quietas), clave: `sin_movimiento:${hoy}` });

    // Reservas vencidas (liberan la pieza) y avisos de taller.
    await vencerReservas();
    await avisosReparaciones(hoy);
    await avisosPedidos(hoy);
    await avisosTesoreria(hoy);
    await avisosFacturacion(hoy);

    // Copia de seguridad diaria
    if (momentoArgentina(ahora).hora >= cfg["backup.hora"] && !hayCopiaDiariaHoy()) {
      try {
        const r = await copiaDiaria(cfg["backup.conservar"], cfg["backup.carpeta_extra"]);
        await db.transaction(async (tx) =>
          auditar(tx, SISTEMA, { accion: "copia_seguridad", entidad: "sistema", descripcion: `Copia de seguridad diaria${r.extra ? " (también en la carpeta adicional)" : ""}` }),
        );
      } catch (e) {
        await crearAlerta({
          tipo: "copia_fallida",
          nivel: "error",
          titulo: "No se pudo hacer la copia de seguridad diaria",
          detalle: `${e instanceof Error ? e.message : e}. Revisá la carpeta adicional en Configuración o descargá una copia a mano.`,
          clave: `copia:${hoyIso(ahora)}`,
        });
      }
    }
  } catch (e) {
    console.error("[tareas] error en el ciclo:", e);
  } finally {
    ocupado = false;
  }
}

/** Enciende el ciclo una sola vez por proceso (en desarrollo Next recarga módulos: se evita duplicarlo). */
export function iniciarTareas() {
  const g = globalThis as unknown as { __mcTareas?: boolean };
  if (g.__mcTareas) return;
  g.__mcTareas = true;
  setTimeout(() => void ciclo(), 3_000);
  setInterval(() => void ciclo(), 60_000).unref?.();
  console.log("[tareas] tareas automáticas encendidas (cotizaciones y copia diaria).");
}

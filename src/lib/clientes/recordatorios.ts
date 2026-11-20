/**
 * Recordatorios: próximos cumpleaños y aniversarios, y saldos pendientes, con el mensaje de WhatsApp listo
 * para enviar (se abre WhatsApp con el texto escrito; la persona lo revisa y toca «Enviar»).
 */
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { clientes, db } from "@/db";
import { leerConfig } from "../config";
import { hoyIso, numero } from "../formato";
import { enlaceWhatsapp } from "../identidad";

/** Días hasta la próxima vez que llega el día y mes de `fecha` (aaaa-mm-dd), contando desde `hoy` (aaaa-mm-dd). */
export function diasHasta(fecha: string, hoy: string) {
  const [, m, d] = fecha.split("-").map(Number);
  const [a, mh, dh] = hoy.split("-").map(Number);
  const base = Date.UTC(a, mh - 1, dh);
  let prox = Date.UTC(a, m - 1, d);
  // 29/02 en años no bisiestos: se festeja el 28/02
  if (m === 2 && d === 29 && new Date(prox).getUTCMonth() !== 1) prox = Date.UTC(a, 1, 28);
  if (prox < base) prox = Date.UTC(a + 1, m - 1, d);
  return Math.round((prox - base) / 86400_000);
}

export const completar = (plantilla: string, v: Record<string, string>) => plantilla.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);

const primerNombre = (n: string) => n.trim().split(/\s+/)[0];

export async function proximosEventos(dias = 30) {
  const hoy = hoyIso();
  const cfg = await leerConfig(["mensajes.cumpleanos", "mensajes.aniversario"]);
  const filas = await db.select().from(clientes).where(and(eq(clientes.activo, true), or(isNotNull(clientes.cumpleanos), isNotNull(clientes.aniversario))));
  const eventos: { clienteId: number; nombre: string; tipo: "cumpleanos" | "aniversario"; fecha: string; dias: number; anios: number | null; whatsapp: string | null; enlace: string | null }[] = [];
  for (const c of filas) {
    for (const tipo of ["cumpleanos", "aniversario"] as const) {
      const f = c[tipo];
      if (!f) continue;
      const n = diasHasta(f, hoy);
      if (n > dias) continue;
      const anio = Number(f.slice(0, 4));
      const anios = anio > 1900 ? Number(hoy.slice(0, 4)) + (n > 0 && f.slice(5) < hoy.slice(5) ? 1 : 0) - anio : null;
      const texto = completar(cfg[`mensajes.${tipo}`], { nombre: primerNombre(c.nombre) });
      eventos.push({ clienteId: c.id, nombre: c.nombre, tipo, fecha: f, dias: n, anios, whatsapp: c.whatsapp, enlace: c.whatsapp ? enlaceWhatsapp(c.whatsapp, texto) : null });
    }
  }
  return eventos.sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre, "es"));
}

export async function saldosPendientes() {
  const cfg = await leerConfig(["mensajes.saldo"]);
  const filas = await db
    .select({
      c: clientes,
      saldo: sql<number>`coalesce((select sum(importe) from movimientos_cc_clientes m where m.cliente_id = "clientes"."id" and m.anulado = 0), 0)`,
      vencido: sql<number>`coalesce((select sum(importe) from movimientos_cc_clientes m where m.cliente_id = "clientes"."id" and m.anulado = 0 and m.importe > 0 and m.vencimiento < ${Date.now()}), 0)`,
    })
    .from(clientes)
    .where(sql`coalesce((select sum(importe) from movimientos_cc_clientes m where m.cliente_id = "clientes"."id" and m.anulado = 0), 0) > 0`);
  return filas
    .map((x) => {
      const texto = completar(cfg["mensajes.saldo"], { nombre: primerNombre(x.c.nombre), saldo: `$ ${numero(x.saldo / 100, 0)}` });
      return { clienteId: x.c.id, nombre: x.c.nombre, saldo: x.saldo, vencido: Math.min(x.vencido, x.saldo), whatsapp: x.c.whatsapp, enlace: x.c.whatsapp ? enlaceWhatsapp(x.c.whatsapp, texto) : null };
    })
    .sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
}

/** Gift cards y vales por devolución: código, saldo y vencimiento. */
import { and, desc, eq } from "drizzle-orm";
import { db, valeMovimientos, vales, type Tx } from "@/db";
import { ErrorValidacion, leerUna } from "../config";

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function codigoVale(tipo: "gift_card" | "vale") {
  const r = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => LETRAS[n % LETRAS.length]).join("");
  return `${tipo === "gift_card" ? "GC" : "VL"}-${r()}-${r()}`;
}

export async function crearVale(tx: Tx, d: { tipo: "gift_card" | "vale"; monto: number; clienteId: number | null; ventaId: number | null; descripcion: string }) {
  const meses = await leerUna("ventas.vale_meses", tx);
  const vence = new Date();
  vence.setMonth(vence.getMonth() + meses);
  const codigo = codigoVale(d.tipo);
  const [v] = await tx.insert(vales).values({ codigo, tipo: d.tipo, clienteId: d.clienteId, monto: d.monto, saldo: d.monto, vence, ventaOrigenId: d.ventaId, creadoEn: new Date() }).returning({ id: vales.id });
  await tx.insert(valeMovimientos).values({ valeId: v.id, fecha: new Date(), importe: d.monto, ventaId: d.ventaId, descripcion: d.descripcion });
  return { id: v.id, codigo, vence };
}

/** Descuenta del saldo de un vale (falla si no alcanza, venció o está anulado). */
export async function usarVale(tx: Tx, codigo: string, importe: number, ventaId: number | null) {
  const [v] = await tx.select().from(vales).where(eq(vales.codigo, codigo.trim().toUpperCase()));
  if (!v || v.anulado) throw new ErrorValidacion(`El vale ${codigo.toUpperCase()} no existe.`);
  if (v.vence && v.vence.getTime() < Date.now()) throw new ErrorValidacion(`El vale ${v.codigo} venció.`);
  if (v.saldo < importe) throw new ErrorValidacion(`El vale ${v.codigo} tiene saldo $ ${(v.saldo / 100).toLocaleString("es-AR")}.`);
  await tx.update(vales).set({ saldo: v.saldo - importe }).where(eq(vales.id, v.id));
  await tx.insert(valeMovimientos).values({ valeId: v.id, fecha: new Date(), importe: -importe, ventaId, descripcion: ventaId ? "Usado en una venta" : "Usado" });
  return v.id;
}

/** Devuelve saldo a un vale (al anular la venta que lo usó). */
export async function reintegrarVale(tx: Tx, valeId: number, importe: number, ventaId: number) {
  const [v] = await tx.select().from(vales).where(eq(vales.id, valeId));
  if (!v) return;
  await tx.update(vales).set({ saldo: v.saldo + importe }).where(eq(vales.id, valeId));
  await tx.insert(valeMovimientos).values({ valeId, fecha: new Date(), importe, ventaId, descripcion: "Reintegro por anulación de venta" });
}

export async function consultarVale(codigo: string) {
  const [v] = await db.select().from(vales).where(eq(vales.codigo, codigo.trim().toUpperCase()));
  if (!v) return null;
  const movs = await db.select().from(valeMovimientos).where(eq(valeMovimientos.valeId, v.id)).orderBy(desc(valeMovimientos.fecha));
  return { ...v, movimientos: movs, vencido: !!v.vence && v.vence.getTime() < Date.now() };
}

export const listarVales = () => db.select().from(vales).where(and(eq(vales.anulado, false))).orderBy(desc(vales.creadoEn)).limit(300);

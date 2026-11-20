/** Puntos de venta de factura electrónica (tienen que estar dados de alta en ARCA como «Web services»). */
import { asc, eq, ne } from "drizzle-orm";
import { db, puntosVenta } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";

export const listarPuntosVenta = () => db.select().from(puntosVenta).orderBy(asc(puntosVenta.numero));

export async function guardarPuntoVenta(id: number | null, d: { numero: number; nombre: string; activo: boolean; porDefecto: boolean }, actor: Actor) {
  if (!Number.isInteger(d.numero) || d.numero < 1 || d.numero > 99998) throw new ErrorValidacion("El número de punto de venta va de 1 a 99998.");
  if (d.nombre.trim().length < 2) throw new ErrorValidacion("Escribí un nombre (por ejemplo «Local»).");
  await db.transaction(async (tx) => {
    const [otro] = await tx.select().from(puntosVenta).where(eq(puntosVenta.numero, d.numero));
    if (otro && otro.id !== id) throw new ErrorValidacion(`El punto de venta ${d.numero} ya existe.`);
    const datos = { numero: d.numero, nombre: d.nombre.trim(), activo: d.activo, porDefecto: d.porDefecto && d.activo };
    let pid = id;
    if (id) await tx.update(puntosVenta).set(datos).where(eq(puntosVenta.id, id));
    else pid = (await tx.insert(puntosVenta).values(datos).returning({ id: puntosVenta.id }))[0].id;
    if (datos.porDefecto) await tx.update(puntosVenta).set({ porDefecto: false }).where(ne(puntosVenta.id, pid!));
    await auditar(tx, actor, { accion: id ? "modificacion" : "alta", entidad: "comprobante_fiscal", descripcion: `Punto de venta ${d.numero} «${datos.nombre}»${datos.activo ? "" : " (inactivo)"}${datos.porDefecto ? " (por defecto)" : ""}` });
  });
}

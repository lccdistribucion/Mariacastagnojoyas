/**
 * Sugerencia de reposición: artículos por cantidad en o por debajo del mínimo, agrupados por proveedor habitual.
 * Sugerido = llevar al doble del mínimo. (Con el módulo de Ventas se suma el ritmo de venta de cada artículo).
 */
import { and, asc, gt, inArray, sql } from "drizzle-orm";
import { db, productos, proveedores } from "@/db";
import { eq } from "drizzle-orm";

export async function sugerenciaReposicion() {
  const filas = await db
    .select({ p: productos, proveedor: proveedores.razonSocial })
    .from(productos)
    .leftJoin(proveedores, eq(proveedores.id, productos.proveedorId))
    .where(and(inArray(productos.tipo, ["cantidad", "insumo", "packaging"]), gt(productos.stockMinimo, 0), sql`${productos.cantidad} <= ${productos.stockMinimo}`, sql`${productos.estado} not in ('baja','devuelto')`))
    .orderBy(asc(proveedores.razonSocial), asc(productos.nombre));
  return filas.map((x) => ({ ...x, sugerido: Math.max(1, x.p.stockMinimo * 2 - x.p.cantidad) }));
}

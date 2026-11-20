import "server-only";
import { listarCategorias, listarUbicaciones } from "@/lib/stock/catalogos";
import { contextoPrecios, sugerencias } from "@/lib/stock/consultas";
import { listarLeyes } from "@/lib/cotizaciones/vigentes";
import { opcionesProveedores } from "@/lib/proveedores/proveedores";

/** Todo lo que necesita el formulario de una pieza. */
export async function datosFormulario(verProveedores: boolean) {
  const [cats, ubis, leyes, ctx, sug, provs] = await Promise.all([listarCategorias(), listarUbicaciones(), listarLeyes(true), contextoPrecios(), sugerencias(), opcionesProveedores()]);
  return {
    categorias: cats.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre })),
    ubicaciones: ubis.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre })),
    leyes: leyes.map((l) => ({ id: l.id, nombre: l.nombre, metal: l.metal, gramoVenta: ctx.gramo.get(l.id) ?? null })),
    cot: ctx.cot,
    colecciones: sug.colecciones,
    artesanos: sug.artesanos,
    proveedores: verProveedores ? provs : [],
  };
}

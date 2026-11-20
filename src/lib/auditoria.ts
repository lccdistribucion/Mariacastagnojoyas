/**
 * Registro de auditoría. Se escribe DENTRO de la misma transacción que la operación auditada:
 * si la operación se deshace, su registro también; si se guarda, queda registrada sí o sí.
 */
import { auditoria, type Tx } from "@/db";

/** Quién hace la acción. `id: null` = el sistema (tareas automáticas, carga inicial). */
export type Actor = { id: number | null; nombre: string; ip?: string | null };
export const SISTEMA: Actor = { id: null, nombre: "Sistema" };

export const ACCIONES = {
  alta: "Alta",
  modificacion: "Modificación",
  desactivacion: "Desactivación",
  reactivacion: "Reactivación",
  anulacion: "Anulación",
  ingreso: "Ingreso",
  ingreso_fallido: "Ingreso fallido",
  bloqueo: "Bloqueo",
  desbloqueo: "Desbloqueo",
  salida: "Salida",
  cambio_clave: "Cambio de clave",
  autorizacion: "Autorización",
  autorizacion_rechazada: "Autorización rechazada",
  copia_seguridad: "Copia de seguridad",
  exportacion: "Exportación",
} as const;
export type Accion = keyof typeof ACCIONES;

export const ENTIDADES: Record<string, string> = {
  usuario: "Usuario",
  caja: "Cajas y cuentas",
  comprobante_fiscal: "Facturación electrónica",
  movimiento_caja: "Movimientos de caja",
  arqueo: "Apertura y cierre de caja",
  cheque: "Cheques",
  acreditacion: "Acreditaciones de tarjetas",
  sesion: "Sesión",
  configuracion: "Configuración",
  sistema: "Sistema",
  auditoria: "Auditoría",
  cotizacion: "Cotizaciones",
  ley_metal: "Leyes de metal",
  producto: "Piezas y stock",
  categoria: "Categorías",
  ubicacion: "Ubicaciones",
  lista_precios: "Listas de precios",
  inventario: "Inventario físico",
  cliente: "Clientes",
  proveedor: "Proveedores",
  compra: "Compras",
  pago_proveedor: "Pagos a proveedores",
  consignacion: "Consignaciones",
  metal: "Metal propio",
  venta: "Ventas",
  cobro: "Cobros",
  reserva: "Reservas y señas",
  presupuesto: "Presupuestos",
  pedido: "Pedidos a medida",
  reparacion: "Reparaciones",
  vale: "Vales y gift cards",
  medio_pago: "Medios de cobro",
};

/** Campos que jamás se guardan en la auditoría (claves, hashes, tokens). */
const SENSIBLE = /clave|hash|token|secret|password|certificado/i;

function limpiar(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(limpiar);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = SENSIBLE.test(k) ? "[oculto]" : limpiar(val);
  return out;
}

/** Devuelve solo los campos que cambiaron entre `antes` y `despues`. */
export function diferencias(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const k of Object.keys(despues)) {
    const va = antes[k] instanceof Date ? (antes[k] as Date).getTime() : antes[k];
    const vd = despues[k] instanceof Date ? (despues[k] as Date).getTime() : despues[k];
    if (JSON.stringify(va) !== JSON.stringify(vd)) {
      a[k] = antes[k];
      d[k] = despues[k];
    }
  }
  return { antes: a, despues: d, hayCambios: Object.keys(d).length > 0 };
}

export async function auditar(
  tx: Tx,
  actor: Actor,
  e: {
    accion: Accion;
    entidad: string;
    entidadId?: string | number | null;
    descripcion: string;
    antes?: unknown;
    despues?: unknown;
  },
) {
  await tx.insert(auditoria).values({
    fecha: new Date(),
    usuarioId: actor.id,
    usuarioNombre: actor.nombre,
    accion: e.accion,
    entidad: e.entidad,
    entidadId: e.entidadId == null ? null : String(e.entidadId),
    descripcion: e.descripcion,
    antes: e.antes === undefined ? null : JSON.stringify(limpiar(e.antes)),
    despues: e.despues === undefined ? null : JSON.stringify(limpiar(e.despues)),
    ip: actor.ip ?? null,
  });
}

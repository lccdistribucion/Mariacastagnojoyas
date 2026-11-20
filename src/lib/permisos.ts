/**
 * Catálogo de permisos. El rol da la base y el admin puede conceder permisos puntuales a un usuario
 * (por ejemplo «ver ventas sin facturar»). El Administrador tiene todo y no se le puede quitar nada.
 * Este archivo no toca la base: se puede usar desde el servidor, el navegador y las pruebas.
 */
export const PERMISOS = {
  ver_costos: "Ver costos y márgenes",
  ver_proveedores: "Ver proveedores y compras",
  ver_tesoreria: "Ver tesorería general",
  ver_sin_facturar: "Ver ventas sin facturar",
  cargar_sin_facturar: "Cargar ventas sin facturar",
  ver_ventas_de_todos: "Ver ventas de todos los vendedores",
  anular_comprobantes: "Anular comprobantes",
  ajustar_stock: "Ajustar stock",
  modificar_precios: "Modificar precios",
  modificar_cotizaciones: "Modificar cotizaciones",
  gestionar_usuarios: "Crear y editar usuarios",
  ver_auditoria: "Ver registro de auditoría",
  configurar_sistema: "Cambiar la configuración",
  cerrar_periodos: "Cerrar y reabrir períodos",
  cargar_productos: "Cargar y editar piezas",
} as const;

export type Permiso = keyof typeof PERMISOS;
export type Rol = "admin" | "usuario";

export const ROLES: Record<Rol, string> = { admin: "Administrador", usuario: "Usuario (vendedor/a)" };

/** Permisos que un Usuario puede recibir por excepción. Los demás son exclusivos del Administrador. */
export const PERMISOS_DELEGABLES: Permiso[] = [
  "cargar_productos",
  "ver_sin_facturar",
  "cargar_sin_facturar",
  "ver_ventas_de_todos",
  "ver_costos",
  "ver_proveedores",
  "ajustar_stock",
  "anular_comprobantes",
];

/** Lo que trae cada rol de base. */
const BASE: Record<Rol, readonly Permiso[]> = {
  admin: Object.keys(PERMISOS) as Permiso[],
  usuario: [],
};

/** Permisos efectivos: base del rol + concesiones/quitas puntuales (solo sobre los delegables). */
export function permisosEfectivos(rol: Rol, excepciones: { permiso: string; concedido: boolean }[] = []): Set<Permiso> {
  const set = new Set<Permiso>(BASE[rol]);
  if (rol === "admin") return set;
  for (const e of excepciones) {
    if (!PERMISOS_DELEGABLES.includes(e.permiso as Permiso)) continue;
    if (e.concedido) set.add(e.permiso as Permiso);
    else set.delete(e.permiso as Permiso);
  }
  return set;
}

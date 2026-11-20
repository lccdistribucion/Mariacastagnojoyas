/** Menú del sistema. Los módulos que todavía no están hechos se muestran apagados, con su número de etapa. */
import type { Permiso } from "@/lib/permisos";

export type ItemMenu = {
  href: string;
  etiqueta: string;
  icono: string;
  /** Módulo de la etapa de desarrollo en que llega (si todavía no está). */
  proximo?: number;
  permiso?: Permiso;
  /** Número a mostrar al lado (por ejemplo, avisos sin leer). */
  contador?: number;
};

export const MENU_PRINCIPAL: ItemMenu[] = [
  { href: "/", etiqueta: "Inicio", icono: "inicio" },
  { href: "/mostrador", etiqueta: "Mostrador", icono: "mostrador" },
  { href: "/ventas", etiqueta: "Ventas y reservas", icono: "ventas" },
  { href: "/cotizaciones", etiqueta: "Cotizaciones", icono: "cotizaciones" },
  { href: "/stock", etiqueta: "Piezas y stock", icono: "anillo" },
  { href: "/clientes", etiqueta: "Clientes", icono: "clientes" },
  { href: "/taller", etiqueta: "Taller y pedidos", icono: "taller" },
  { href: "/proveedores", etiqueta: "Proveedores y compras", icono: "proveedores", permiso: "ver_proveedores" },
  { href: "/caja", etiqueta: "Caja del día", icono: "caja" },
  { href: "/tesoreria", etiqueta: "Tesorería", icono: "tesoreria", permiso: "ver_tesoreria" },
  { href: "/facturacion", etiqueta: "Facturación", icono: "factura", permiso: "ver_ventas_de_todos" },
  { href: "/informes", etiqueta: "Informes", icono: "informes", proximo: 8 },
];

export const MENU_ADMIN: ItemMenu[] = [
  { href: "/alertas", etiqueta: "Avisos", icono: "alertas", permiso: "modificar_cotizaciones" },
  { href: "/usuarios", etiqueta: "Usuarios", icono: "usuarios", permiso: "gestionar_usuarios" },
  { href: "/auditoria", etiqueta: "Auditoría", icono: "auditoria", permiso: "ver_auditoria" },
  { href: "/configuracion", etiqueta: "Configuración", icono: "ajustes", permiso: "configurar_sistema" },
];

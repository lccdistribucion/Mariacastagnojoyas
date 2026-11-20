/** Catálogos fijos del módulo de stock (etiquetas para mostrar). Sin base de datos. */
export const TIPOS = {
  unica: "Pieza única",
  cantidad: "Artículo por cantidad",
  insumo: "Insumo",
  packaging: "Packaging",
} as const;
export type Tipo = keyof typeof TIPOS;

export const ESTADOS = {
  disponible: "Disponible",
  reservado: "Reservada",
  senado: "Señada",
  vendido: "Vendida",
  reparacion: "En reparación",
  taller: "En taller",
  consignacion_afuera: "En consignación afuera",
  afuera: "Fuera del local",
  baja: "Dada de baja",
  devuelto: "Devuelta al proveedor",
} as const;
export type EstadoPieza = keyof typeof ESTADOS;
/** Estados que se pueden elegir a mano (vendido/señado/reservado los ponen las ventas; afuera, las salidas). */
export const ESTADOS_MANUALES: EstadoPieza[] = ["disponible", "reparacion", "taller", "consignacion_afuera"];
/** Estados que cuentan como stock del negocio (para la valuación). */
export const ESTADOS_EN_STOCK: EstadoPieza[] = ["disponible", "reservado", "senado", "reparacion", "taller", "consignacion_afuera", "afuera"];

export const ORIGENES = {
  compra: "Compra",
  consignacion: "Consignación recibida",
  fabricacion: "Fabricación propia",
  canje: "Canje / permuta",
  inventario: "Inventario inicial",
} as const;
export type Origen = keyof typeof ORIGENES;

export const MONEDAS = { ARS: "Pesos", USD: "Dólares", EUR: "Euros" } as const;
export type Moneda = keyof typeof MONEDAS;

export const MOTIVOS_AJUSTE = {
  rotura: "Rotura",
  perdida: "Pérdida",
  faltante: "Faltante",
  diferencia_inventario: "Diferencia de inventario",
  sobrante: "Sobrante / apareció",
  otro: "Otro",
} as const;
export type MotivoAjuste = keyof typeof MOTIVOS_AJUSTE;

export const DESTINOS_SALIDA = {
  prueba_cliente: "Prueba de cliente",
  feria: "Feria",
  exhibicion: "Exhibición",
  otro: "Otro",
} as const;

export const ALICUOTAS_IVA = [
  { valor: 2100, etiqueta: "21 %" },
  { valor: 1050, etiqueta: "10,5 %" },
  { valor: 0, etiqueta: "0 % / exento" },
];

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  alta: "Alta",
  ajuste: "Ajuste",
  salida: "Salida del local",
  devolucion: "Volvió al local",
  estado: "Cambio de estado",
  ubicacion: "Cambio de ubicación",
  inventario: "Inventario",
  venta: "Venta",
  compra: "Compra",
  precio: "Cambio de precio",
  edicion: "Edición",
  devolucion_proveedor: "Devuelta al proveedor",
  consignacion_entregada: "Entregada en consignación",
};

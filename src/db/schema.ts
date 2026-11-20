/**
 * Esquema de la base de datos — Módulo 1: usuarios, permisos, sesiones, seguridad y auditoría.
 *
 * Convenciones para TODO el sistema (valen también para los módulos siguientes):
 * - Fechas: milisegundos desde 1970 (`timestamp_ms`). Se muestran en hora argentina (dd/mm/aaaa).
 * - Montos: enteros en centavos. Pesos de metal: enteros en miligramos. Porcentajes: enteros en centésimos
 *   de punto (1050 = 10,50 %). Así no hay errores de redondeo con decimales.
 * - Nada se borra: los registros se desactivan (`activo = false`) o se anulan, y todo queda en `auditoria`.
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const ahora = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const usuarios = sqliteTable("usuarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Nombre de ingreso, en minúsculas y sin espacios. Único. */
  usuario: text("usuario").notNull().unique(),
  nombre: text("nombre").notNull(),
  rol: text("rol", { enum: ["admin", "usuario"] }).notNull(),
  claveHash: text("clave_hash").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  /** Obliga a cambiar la clave en el próximo ingreso (alta nueva o clave reiniciada por el admin). */
  debeCambiarClave: integer("debe_cambiar_clave", { mode: "boolean" }).notNull().default(false),
  /** Descuento máximo propio en centésimos de punto; null = usa el general de Configuración. */
  descuentoMaxPct: integer("descuento_max_pct"),
  /** Comisión sobre ventas en centésimos de punto (se usa en el módulo de Ventas). */
  comisionPct: integer("comision_pct").notNull().default(0),
  /** Al cambiar la clave o desactivar, sube y cierra todas las sesiones abiertas. */
  versionSesion: integer("version_sesion").notNull().default(1),
  ultimoIngreso: integer("ultimo_ingreso", { mode: "timestamp_ms" }),
  creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
});

/** Permisos puntuales que el admin le da (o le quita) a un usuario, por encima de lo que trae su rol. */
export const permisosUsuario = sqliteTable(
  "permisos_usuario",
  {
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
    permiso: text("permiso").notNull(),
    concedido: integer("concedido", { mode: "boolean" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.permiso] })],
);

export const sesiones = sqliteTable(
  "sesiones",
  {
    /** Hash SHA-256 del token de la cookie: si alguien copiara la base, no podría usar las sesiones. */
    id: text("id").primaryKey(),
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
    version: integer("version").notNull(),
    creadaEn: integer("creada_en", { mode: "timestamp_ms" }).notNull(),
    ultimaActividad: integer("ultima_actividad", { mode: "timestamp_ms" }).notNull(),
    expiraEn: integer("expira_en", { mode: "timestamp_ms" }).notNull(),
    cerradaEn: integer("cerrada_en", { mode: "timestamp_ms" }),
    motivoCierre: text("motivo_cierre"),
    ip: text("ip"),
    dispositivo: text("dispositivo"),
  },
  (t) => [index("sesiones_usuario_idx").on(t.usuarioId)],
);

/** Intentos fallidos de ingreso, por usuario ("u:maria") y por dirección ("ip:1.2.3.4"). */
export const intentosIngreso = sqliteTable("intentos_ingreso", {
  clave: text("clave").primaryKey(),
  fallos: integer("fallos").notNull().default(0),
  bloqueadoHasta: integer("bloqueado_hasta", { mode: "timestamp_ms" }),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp_ms" }).notNull(),
});

/** Registro de auditoría: quién hizo qué, cuándo, y qué valor había antes. Solo se agregan filas. */
export const auditoria = sqliteTable(
  "auditoria",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull().default(ahora),
    usuarioId: integer("usuario_id"),
    /** Copia del nombre al momento de la acción (por si después se renombra el usuario). */
    usuarioNombre: text("usuario_nombre").notNull(),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: text("entidad_id"),
    descripcion: text("descripcion").notNull(),
    /** JSON con los valores anteriores (solo los campos que cambiaron). */
    antes: text("antes"),
    /** JSON con los valores nuevos. */
    despues: text("despues"),
    ip: text("ip"),
  },
  (t) => [
    index("auditoria_fecha_idx").on(t.fecha),
    index("auditoria_entidad_idx").on(t.entidad, t.entidadId),
    index("auditoria_usuario_idx").on(t.usuarioId),
  ],
);

/** Configuración general (clave → valor JSON). Cada cambio queda en auditoría. */
export const configuracion = sqliteTable("configuracion", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
  actualizadoEn: integer("actualizado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
  actualizadoPor: integer("actualizado_por"),
});

/* ─────────────────────────── Módulo 2: cotizaciones ─────────────────────────── */

/**
 * Historial de cotizaciones. Monedas: pesos por unidad. Metales (XAU, XAG): dólares por onza troy.
 * Valores en millonésimos (1.605,30 → 1605300000) para no perder decimales.
 */
export const cotizaciones = sqliteTable(
  "cotizaciones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codigo: text("codigo").notNull(),
    compra: integer("compra").notNull(),
    venta: integer("venta").notNull(),
    fuente: text("fuente").notNull(),
    /** automatica | respaldo | manual | historico */
    origen: text("origen").notNull(),
    /** Cuándo la guardó el sistema. */
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    /** Fecha que informa la fuente (puede ser anterior: el BCRA publica al cierre). */
    fechaFuente: integer("fecha_fuente", { mode: "timestamp_ms" }),
    usuarioId: integer("usuario_id"),
    nota: text("nota"),
  },
  (t) => [index("cotizaciones_codigo_fecha_idx").on(t.codigo, t.fecha)],
);

/** Estado de cada cotización: último intento, último éxito y de dónde vino. Alimenta el semáforo. */
export const cotizacionesEstado = sqliteTable("cotizaciones_estado", {
  codigo: text("codigo").primaryKey(),
  ultimoIntento: integer("ultimo_intento", { mode: "timestamp_ms" }),
  ultimoOk: integer("ultimo_ok", { mode: "timestamp_ms" }),
  fuente: text("fuente"),
  esRespaldo: integer("es_respaldo", { mode: "boolean" }).notNull().default(false),
  error: text("error"),
});

/** Cotizaciones propias del negocio: mientras existan, mandan sobre la automática. */
export const cotizacionesFijas = sqliteTable("cotizaciones_fijas", {
  codigo: text("codigo").primaryKey(),
  compra: integer("compra").notNull(),
  venta: integer("venta").notNull(),
  desde: integer("desde", { mode: "timestamp_ms" }).notNull(),
  usuarioId: integer("usuario_id").notNull(),
  nota: text("nota"),
});

/** Registro de cada corrida de actualización (automática o «Actualizar ahora»). */
export const actualizacionesCotizacion = sqliteTable(
  "actualizaciones_cotizacion",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    origen: text("origen").notNull(), // automatica | manual
    usuarioId: integer("usuario_id"),
    actualizadas: integer("actualizadas").notNull(),
    conRespaldo: integer("con_respaldo").notNull(),
    fallidas: integer("fallidas").notNull(),
    /** JSON: por fuente, si respondió y el error si no. */
    detalle: text("detalle").notNull(),
    duracionMs: integer("duracion_ms").notNull(),
  },
  (t) => [index("actualizaciones_fecha_idx").on(t.fecha)],
);

/** Leyes de metal (configurables): nombre, quilates, milésimos y ajustes propios de venta y compra. */
export const leyesMetal = sqliteTable("leyes_metal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  /** oro | plata | otro */
  metal: text("metal").notNull(),
  quilates: integer("quilates"),
  /** Pureza en milésimos (750 = 75 %). */
  milesimos: integer("milesimos").notNull(),
  /** Ajuste sobre el valor de mercado, en centésimos de punto (+1000 = +10 %). */
  ajusteVentaPct: integer("ajuste_venta_pct").notNull().default(0),
  ajusteCompraPct: integer("ajuste_compra_pct").notNull().default(0),
  /** Para metales sin cotización automática: precio del gramo en centavos, cargado a mano. */
  precioManualGramo: integer("precio_manual_gramo"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/** Avisos para el administrador (fuente caída, uso de respaldo, variación fuerte, copia fallida…). */
export const alertas = sqliteTable(
  "alertas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    tipo: text("tipo").notNull(),
    /** info | alerta | error */
    nivel: text("nivel").notNull(),
    titulo: text("titulo").notNull(),
    detalle: text("detalle"),
    /** Evita repetir el mismo aviso (por ejemplo, uno por fuente y por día). */
    clave: text("clave").unique(),
    leidaEn: integer("leida_en", { mode: "timestamp_ms" }),
    leidaPor: integer("leida_por"),
  },
  (t) => [index("alertas_fecha_idx").on(t.fecha)],
);

/* ─────────────────────────── Módulo 3: piezas y stock ─────────────────────────── */

export const categorias = sqliteTable("categorias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  /** Prefijo para el código automático (ANI → ANI-0001). */
  prefijo: text("prefijo").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

export const ubicaciones = sqliteTable("ubicaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/** Listas de precios (contado, tarjeta, mayorista…): ajuste en centésimos de punto sobre el precio de la pieza. */
export const listasPrecios = sqliteTable("listas_precios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  ajustePct: integer("ajuste_pct").notNull().default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * Piezas y artículos. Montos en centavos de su moneda; pesos en miligramos.
 * tipo: unica | cantidad | insumo | packaging
 * modo_precio: fijo (precio de lista) | gramo (peso neto × gramo de la ley + hechura, se recalcula con la cotización)
 * estado: disponible | reservado | senado | vendido | reparacion | taller | consignacion_afuera | afuera | baja
 */
export const productos = sqliteTable(
  "productos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codigo: text("codigo").notNull().unique(),
    codigoBarras: text("codigo_barras").unique(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(),
    categoriaId: integer("categoria_id").references(() => categorias.id),
    coleccion: text("coleccion"),
    artesano: text("artesano"),
    leyId: integer("ley_id").references(() => leyesMetal.id),
    /** Metal sin cotización o terminación: acero, baño de oro, oro blanco, rodinado… */
    metalDetalle: text("metal_detalle"),
    pesoBrutoMg: integer("peso_bruto_mg"),
    pesoNetoMg: integer("peso_neto_mg"),
    medidas: text("medidas"),
    talle: text("talle"),
    descripcion: text("descripcion"),
    notasInternas: text("notas_internas"),
    costoMetal: integer("costo_metal").notNull().default(0),
    costoManoObra: integer("costo_mano_obra").notNull().default(0),
    costoPiedras: integer("costo_piedras").notNull().default(0),
    costoOtros: integer("costo_otros").notNull().default(0),
    monedaCosto: text("moneda_costo").notNull().default("ARS"),
    modoPrecio: text("modo_precio").notNull().default("fijo"),
    precioLista: integer("precio_lista").notNull().default(0),
    precioOferta: integer("precio_oferta"),
    monedaPrecio: text("moneda_precio").notNull().default("ARS"),
    /** Para precio por gramo: mano de obra que se suma (centavos de pesos). */
    hechura: integer("hechura").notNull().default(0),
    ivaPct: integer("iva_pct").notNull().default(2100),
    /** Módulo 7: general | bienes_usados (IVA solo sobre la diferencia con el costo) | exento. A validar con el contador. */
    tratamientoIva: text("tratamiento_iva").notNull().default("general"),
    origen: text("origen").notNull(),
    consignante: text("consignante"),
    ubicacionId: integer("ubicacion_id").references(() => ubicaciones.id),
    /** Proveedor de origen (compra) o dueño de la pieza (consignación). Módulo 4. */
    proveedorId: integer("proveedor_id"),
    estado: text("estado").notNull().default("disponible"),
    cantidad: integer("cantidad").notNull().default(1),
    stockMinimo: integer("stock_minimo").notNull().default(0),
    precioActualizadoEn: integer("precio_actualizado_en", { mode: "timestamp_ms" }),
    esDemo: integer("es_demo", { mode: "boolean" }).notNull().default(false),
    creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
    actualizadoEn: integer("actualizado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
  },
  (t) => [index("productos_estado_idx").on(t.estado), index("productos_categoria_idx").on(t.categoriaId), index("productos_nombre_idx").on(t.nombre)],
);

export const productoPiedras = sqliteTable("producto_piedras", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  tipo: text("tipo").notNull(),
  cantidad: integer("cantidad").notNull().default(1),
  /** Quilates (ct) × 100: 0,25 ct → 25. */
  quilates: integer("quilates"),
  calidad: text("calidad"),
  certificado: text("certificado"),
});

export const productoFotos = sqliteTable("producto_fotos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  archivo: text("archivo").notNull(),
  orden: integer("orden").notNull().default(0),
  ancho: integer("ancho"),
  alto: integer("alto"),
  /** Las fotos no se borran: se ocultan. */
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
  creadaEn: integer("creada_en", { mode: "timestamp_ms" }).notNull().default(ahora),
});

/** Historial completo de cada pieza (trazabilidad). Solo se agregan filas. */
export const movimientosStock = sqliteTable(
  "movimientos_stock",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productoId: integer("producto_id").notNull().references(() => productos.id),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    /** alta | ajuste | salida | devolucion | estado | ubicacion | inventario | venta | compra | precio */
    tipo: text("tipo").notNull(),
    cantidad: integer("cantidad").notNull().default(0),
    stockResultante: integer("stock_resultante"),
    estadoAntes: text("estado_antes"),
    estadoDespues: text("estado_despues"),
    ubicacionAntes: integer("ubicacion_antes"),
    ubicacionDespues: integer("ubicacion_despues"),
    motivo: text("motivo"),
    documento: text("documento"),
    usuarioId: integer("usuario_id"),
    autorizadoPor: integer("autorizado_por"),
  },
  (t) => [index("movimientos_producto_idx").on(t.productoId, t.fecha)],
);

/** Historial de precios de cada pieza (para saber cuándo y por qué cambió). */
export const historialPrecios = sqliteTable(
  "historial_precios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productoId: integer("producto_id").notNull().references(() => productos.id),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    listaAntes: integer("lista_antes"),
    listaDespues: integer("lista_despues"),
    ofertaAntes: integer("oferta_antes"),
    ofertaDespues: integer("oferta_despues"),
    moneda: text("moneda").notNull(),
    motivo: text("motivo").notNull(),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("historial_precios_producto_idx").on(t.productoId)],
);

/** Piezas retiradas del local (ferias, exhibiciones, pruebas de clientes) con fecha de devolución esperada. */
export const salidasPiezas = sqliteTable("salidas_piezas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  destino: text("destino").notNull(), // feria | exhibicion | prueba_cliente | otro
  detalle: text("detalle").notNull(),
  responsable: text("responsable"),
  fechaSalida: integer("fecha_salida", { mode: "timestamp_ms" }).notNull(),
  devolucionEsperada: integer("devolucion_esperada", { mode: "timestamp_ms" }).notNull(),
  devueltaEn: integer("devuelta_en", { mode: "timestamp_ms" }),
  estadoPrevio: text("estado_previo").notNull(),
  usuarioId: integer("usuario_id"),
  notas: text("notas"),
});

/** Control de inventario físico: se escanean los códigos y se compara contra el sistema. */
export const inventarios = sqliteTable("inventarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  ubicacionId: integer("ubicacion_id"),
  iniciadoEn: integer("iniciado_en", { mode: "timestamp_ms" }).notNull(),
  cerradoEn: integer("cerrado_en", { mode: "timestamp_ms" }),
  usuarioId: integer("usuario_id"),
  /** JSON con faltantes y sobrantes al cerrar. */
  resultado: text("resultado"),
});

export const inventarioLecturas = sqliteTable(
  "inventario_lecturas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inventarioId: integer("inventario_id").notNull().references(() => inventarios.id),
    codigo: text("codigo").notNull(),
    productoId: integer("producto_id"),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("lecturas_inventario_idx").on(t.inventarioId)],
);

/* ─────────────────────────── Módulo 4: clientes, proveedores y compras ─────────────────────────── */

export const clientes = sqliteTable(
  "clientes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nombre: text("nombre").notNull(),
    /** DNI | CUIT | CUIL | PAS */
    tipoDoc: text("tipo_doc"),
    /** Solo números (DNI/CUIT) o el texto del pasaporte. Único si está cargado. */
    documento: text("documento").unique(),
    /** consumidor_final | responsable_inscripto | monotributo | exento */
    condicionIva: text("condicion_iva").notNull().default("consumidor_final"),
    domicilio: text("domicilio"),
    localidad: text("localidad"),
    provincia: text("provincia"),
    telefono: text("telefono"),
    /** WhatsApp en formato internacional sin «+» (5493411234567). */
    whatsapp: text("whatsapp"),
    email: text("email"),
    /** aaaa-mm-dd (el año puede ser 1900 si no se conoce). */
    cumpleanos: text("cumpleanos"),
    aniversario: text("aniversario"),
    talles: text("talles"),
    preferencias: text("preferencias"),
    notas: text("notas"),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    esDemo: integer("es_demo", { mode: "boolean" }).notNull().default(false),
    creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
    actualizadoEn: integer("actualizado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
  },
  (t) => [index("clientes_nombre_idx").on(t.nombre), index("clientes_whatsapp_idx").on(t.whatsapp)],
);

/** Lista de deseos: una pieza del stock o algo descripto («anillo de compromiso oro blanco»). */
export const clienteDeseos = sqliteTable("cliente_deseos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  productoId: integer("producto_id"),
  descripcion: text("descripcion").notNull(),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  cumplido: integer("cumplido", { mode: "boolean" }).notNull().default(false),
  usuarioId: integer("usuario_id"),
});

/** Cuenta corriente de clientes, en pesos. importe > 0: el cliente debe; < 0: pagó o tiene saldo a favor. */
export const movimientosCcClientes = sqliteTable(
  "movimientos_cc_clientes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clienteId: integer("cliente_id").notNull().references(() => clientes.id),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    /** saldo_inicial | ajuste | venta | cobro | nota_credito */
    tipo: text("tipo").notNull(),
    importe: integer("importe").notNull(),
    vencimiento: integer("vencimiento", { mode: "timestamp_ms" }),
    descripcion: text("descripcion").notNull(),
    documento: text("documento"),
    anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("cc_clientes_idx").on(t.clienteId, t.fecha)],
);

export const proveedores = sqliteTable("proveedores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  razonSocial: text("razon_social").notNull(),
  nombreFantasia: text("nombre_fantasia"),
  cuit: text("cuit").unique(),
  condicionIva: text("condicion_iva").notNull().default("responsable_inscripto"),
  /** JSON: ["fabricante","mayorista","fundidor","artesano","piedras","insumos","relojes","revendedor"] */
  rubros: text("rubros").notNull().default("[]"),
  contacto: text("contacto"),
  telefono: text("telefono"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  domicilio: text("domicilio"),
  condicionesPago: text("condiciones_pago"),
  /** Días de plazo habitual para calcular el vencimiento de las facturas. */
  diasPago: integer("dias_pago").notNull().default(0),
  notas: text("notas"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  esDemo: integer("es_demo", { mode: "boolean" }).notNull().default(false),
  creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull().default(ahora),
});

/** Compras y facturas de proveedores. Importes en centavos de la moneda de la compra. */
export const compras = sqliteTable(
  "compras",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proveedorId: integer("proveedor_id").notNull().references(() => proveedores.id),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    /** A | B | C | X (interno / sin factura) | R (remito) */
    tipoComprobante: text("tipo_comprobante").notNull(),
    puntoVenta: integer("punto_venta"),
    numero: integer("numero"),
    moneda: text("moneda").notNull().default("ARS"),
    /** Pesos por unidad de la moneda, en millonésimos (1 para pesos). */
    tipoCambio: integer("tipo_cambio").notNull(),
    neto: integer("neto").notNull(),
    iva: integer("iva").notNull().default(0),
    percepcionIva: integer("percepcion_iva").notNull().default(0),
    percepcionIibb: integer("percepcion_iibb").notNull().default(0),
    otrosImpuestos: integer("otros_impuestos").notNull().default(0),
    total: integer("total").notNull(),
    /** contado | cuenta_corriente */
    condicion: text("condicion").notNull(),
    vencimiento: integer("vencimiento", { mode: "timestamp_ms" }),
    notas: text("notas"),
    /** Cotizaciones del momento (JSON) para los informes históricos. */
    cotizaciones: text("cotizaciones"),
    anulada: integer("anulada", { mode: "boolean" }).notNull().default(false),
    anuladaPor: integer("anulada_por"),
    motivoAnulacion: text("motivo_anulacion"),
    usuarioId: integer("usuario_id"),
    creadaEn: integer("creada_en", { mode: "timestamp_ms" }).notNull().default(ahora),
  },
  (t) => [index("compras_proveedor_idx").on(t.proveedorId, t.fecha)],
);

/** Ítems de una compra: una pieza/artículo (nuevo o existente) o metal por gramo. */
export const compraItems = sqliteTable("compra_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  compraId: integer("compra_id").notNull().references(() => compras.id),
  /** pieza | metal */
  tipo: text("tipo").notNull(),
  productoId: integer("producto_id"),
  /** true si la compra dio de alta la pieza (al anular se da de baja). */
  productoNuevo: integer("producto_nuevo", { mode: "boolean" }).notNull().default(false),
  descripcion: text("descripcion").notNull(),
  cantidad: integer("cantidad").notNull().default(1),
  leyId: integer("ley_id"),
  pesoMg: integer("peso_mg"),
  /** Costo unitario (o por gramo para metal), en centavos de la moneda de la compra, sin IVA. */
  costoUnitario: integer("costo_unitario").notNull(),
  ivaPct: integer("iva_pct").notNull().default(2100),
  subtotal: integer("subtotal").notNull(),
});

/** Cuenta corriente con proveedores y terceros, por moneda. importe > 0: le debemos; < 0: nos debe o pagamos. */
export const movimientosCcProveedores = sqliteTable(
  "movimientos_cc_proveedores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proveedorId: integer("proveedor_id").notNull().references(() => proveedores.id),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    /** saldo_inicial | factura | pago | nota_credito | ajuste | consignacion_vendida | entregada_vendida */
    tipo: text("tipo").notNull(),
    moneda: text("moneda").notNull(),
    importe: integer("importe").notNull(),
    vencimiento: integer("vencimiento", { mode: "timestamp_ms" }),
    descripcion: text("descripcion").notNull(),
    compraId: integer("compra_id"),
    pagoId: integer("pago_id"),
    anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("cc_proveedores_idx").on(t.proveedorId, t.fecha)],
);

/** Pagos a proveedores (en el módulo 6 se vinculan con la caja de la que salió el dinero). */
export const pagosProveedores = sqliteTable("pagos_proveedores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proveedorId: integer("proveedor_id").notNull().references(() => proveedores.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  /** pago (le pagamos) | cobro (un tercero nos paga, por ejemplo piezas que vendió en consignación) */
  sentido: text("sentido").notNull().default("pago"),
  moneda: text("moneda").notNull(),
  importe: integer("importe").notNull(),
  /** efectivo | transferencia | cheque | tarjeta | otro */
  medio: text("medio").notNull(),
  tipoCambio: integer("tipo_cambio").notNull(),
  cajaId: integer("caja_id"),
  notas: text("notas"),
  anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
  usuarioId: integer("usuario_id"),
});

export const pagoImputaciones = sqliteTable("pago_imputaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pagoId: integer("pago_id").notNull().references(() => pagosProveedores.id),
  compraId: integer("compra_id").notNull().references(() => compras.id),
  importe: integer("importe").notNull(),
});

/**
 * Metal propio del negocio (gramos), por ley: compras de metal, canjes, fundición, entregas a talleres.
 * Se valúa a la cotización del día (módulo 6: Tesorería).
 */
export const movimientosMetal = sqliteTable(
  "movimientos_metal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    leyId: integer("ley_id").notNull().references(() => leyesMetal.id),
    /** Gramos de la ley (positivo entra, negativo sale), en miligramos. */
    pesoMg: integer("peso_mg").notNull(),
    /** compra | canje | fundicion | taller_entrega | taller_recepcion | ajuste */
    tipo: text("tipo").notNull(),
    /** Costo total en centavos de pesos (para valuar a costo). */
    costo: integer("costo"),
    compraId: integer("compra_id"),
    descripcion: text("descripcion").notNull(),
    anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("metal_ley_idx").on(t.leyId)],
);

/** Consignación ENTREGADA: piezas propias en manos de terceros (revendedores, ferias). */
export const consignacionesEntregadas = sqliteTable("consignaciones_entregadas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proveedorId: integer("proveedor_id").notNull().references(() => proveedores.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  notas: text("notas"),
  usuarioId: integer("usuario_id"),
});

export const consignacionEntregadaItems = sqliteTable("consignacion_entregada_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  consignacionId: integer("consignacion_id").notNull().references(() => consignacionesEntregadas.id),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  /** Lo que el tercero nos tiene que pagar si la vende (centavos de pesos). */
  precioAcordado: integer("precio_acordado").notNull(),
  /** entregada | vendida | devuelta */
  estado: text("estado").notNull().default("entregada"),
  resueltoEn: integer("resuelto_en", { mode: "timestamp_ms" }),
});

/* ─────────────────────────── Módulo 5: ventas, señas, pedidos y reparaciones ─────────────────────────── */

/** Medios de cobro configurables. ajuste_pct: recargo (+) o descuento (−) sobre lo que se paga con ese medio. */
export const mediosPago = sqliteTable("medios_pago", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  /** efectivo | transferencia | qr | debito | credito | cuenta_corriente | vale | saldo_favor | otro */
  tipo: text("tipo").notNull(),
  moneda: text("moneda").notNull().default("ARS"),
  ajustePct: integer("ajuste_pct").notNull().default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
  /** Módulo 6: caja o cuenta donde entra lo cobrado con este medio (vacío = no mueve caja: cuenta corriente, vales…). */
  cajaId: integer("caja_id"),
});

/** Planes de cuotas de las tarjetas de crédito (recargo por plan). */
export const planesCuotas = sqliteTable("planes_cuotas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  medioId: integer("medio_id").notNull().references(() => mediosPago.id),
  cuotas: integer("cuotas").notNull(),
  recargoPct: integer("recargo_pct").notNull().default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

/** Ventas. Importes en centavos de pesos. total = lo que se vende (sin recargos de medios de pago). */
export const ventas = sqliteTable(
  "ventas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Número interno correlativo (independiente del número fiscal de ARCA, módulo 7). */
    numero: integer("numero").notNull().unique(),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    clienteId: integer("cliente_id").references(() => clientes.id),
    vendedorId: integer("vendedor_id").notNull(),
    /** factura (se emite con ARCA en el módulo 7) | interno (sin facturar, solo con permiso) */
    tipoComprobante: text("tipo_comprobante").notNull().default("factura"),
    /** pendiente | emitido | rechazado | no_corresponde (módulo 7) */
    estadoFiscal: text("estado_fiscal").notNull().default("pendiente"),
    listaId: integer("lista_id"),
    subtotal: integer("subtotal").notNull(),
    descuentoPct: integer("descuento_pct").notNull().default(0),
    descuento: integer("descuento").notNull().default(0),
    canje: integer("canje").notNull().default(0),
    total: integer("total").notNull(),
    recargos: integer("recargos").notNull().default(0),
    /** Lo que quedó en cuenta corriente. */
    aCuentaCorriente: integer("a_cuenta_corriente").notNull().default(0),
    comisionPct: integer("comision_pct").notNull().default(0),
    comision: integer("comision").notNull().default(0),
    garantiaMeses: integer("garantia_meses").notNull().default(0),
    autorizoDescuento: integer("autorizo_descuento"),
    cotizaciones: text("cotizaciones"),
    notas: text("notas"),
    presupuestoId: integer("presupuesto_id"),
    reservaId: integer("reserva_id"),
    anulada: integer("anulada", { mode: "boolean" }).notNull().default(false),
    anuladaPor: integer("anulada_por"),
    motivoAnulacion: text("motivo_anulacion"),
    esDemo: integer("es_demo", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("ventas_fecha_idx").on(t.fecha), index("ventas_cliente_idx").on(t.clienteId), index("ventas_vendedor_idx").on(t.vendedorId)],
);

/**
 * Renglones de venta: pieza del stock, servicio (reparación / pedido a medida), gift card.
 * Una pieza única no se puede vender dos veces: índice único sobre las piezas únicas vigentes (no anuladas ni devueltas).
 */
export const ventaItems = sqliteTable(
  "venta_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ventaId: integer("venta_id").notNull().references(() => ventas.id),
    /** pieza | servicio | gift_card */
    tipo: text("tipo").notNull(),
    productoId: integer("producto_id"),
    piezaUnica: integer("pieza_unica", { mode: "boolean" }).notNull().default(false),
    descripcion: text("descripcion").notNull(),
    cantidad: integer("cantidad").notNull().default(1),
    precioUnitario: integer("precio_unitario").notNull(),
    subtotal: integer("subtotal").notNull(),
    /** Costo unitario en pesos al momento de la venta (para rentabilidad). */
    costoUnitario: integer("costo_unitario").notNull().default(0),
    ivaPct: integer("iva_pct").notNull().default(2100),
    /** reparacion:ID | pedido:ID | vale:ID */
    referencia: text("referencia"),
    devueltos: integer("devueltos").notNull().default(0),
    /** true si se anuló la venta o se devolvió la pieza: libera la pieza para venderla de nuevo. */
    liberado: integer("liberado", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("venta_items_venta_idx").on(t.ventaId),
    uniqueIndex("pieza_unica_vendida_una_vez").on(t.productoId).where(sql`pieza_unica = 1 and liberado = 0`),
  ],
);

/** Canje / permuta: el cliente entrega metal o una joya como parte de pago (registro con identificación del vendedor). */
export const canjes = sqliteTable("canjes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ventaId: integer("venta_id").references(() => ventas.id),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  leyId: integer("ley_id").notNull(),
  pesoMg: integer("peso_mg").notNull(),
  /** Precio del gramo aplicado (compra de usado), centavos de pesos. */
  precioGramo: integer("precio_gramo").notNull(),
  valor: integer("valor").notNull(),
  descripcion: text("descripcion").notNull(),
  /** metal (va al metal a fundir) | pieza (entra al stock para revender) */
  destino: text("destino").notNull(),
  productoId: integer("producto_id"),
  anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
});

/** Cobros (de ventas, señas y cuenta corriente). En el módulo 6 se vinculan con la caja. */
export const cobros = sqliteTable(
  "cobros",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    clienteId: integer("cliente_id"),
    ventaId: integer("venta_id"),
    /** venta | sena | cobro_cc */
    origen: text("origen").notNull(),
    /** reserva:ID | pedido:ID | reparacion:ID (para las señas) */
    referencia: text("referencia"),
    medioId: integer("medio_id").notNull(),
    medioTipo: text("medio_tipo").notNull(),
    moneda: text("moneda").notNull(),
    /** Importe en la moneda en que pagó. */
    importe: integer("importe").notNull(),
    tipoCambio: integer("tipo_cambio").notNull(),
    /** Lo que cancela de la deuda (pesos) y el recargo/descuento del medio (pesos). */
    aplicado: integer("aplicado").notNull(),
    recargo: integer("recargo").notNull().default(0),
    cuotas: integer("cuotas"),
    valeId: integer("vale_id"),
    cajaId: integer("caja_id"),
    anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("cobros_fecha_idx").on(t.fecha), index("cobros_venta_idx").on(t.ventaId)],
);

/** Gift cards y vales (por devolución). */
export const vales = sqliteTable("vales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  codigo: text("codigo").notNull().unique(),
  /** gift_card | vale */
  tipo: text("tipo").notNull(),
  clienteId: integer("cliente_id"),
  monto: integer("monto").notNull(),
  saldo: integer("saldo").notNull(),
  vence: integer("vence", { mode: "timestamp_ms" }),
  ventaOrigenId: integer("venta_origen_id"),
  anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
  creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull(),
});

export const valeMovimientos = sqliteTable("vale_movimientos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  valeId: integer("vale_id").notNull().references(() => vales.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  importe: integer("importe").notNull(),
  ventaId: integer("venta_id"),
  descripcion: text("descripcion").notNull(),
});

/** Devoluciones y cambios (la nota de crédito fiscal se emite en el módulo 7). */
export const devoluciones = sqliteTable("devoluciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ventaId: integer("venta_id").notNull().references(() => ventas.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  /** JSON: [{itemId, cantidad, importe}] */
  items: text("items").notNull(),
  importe: integer("importe").notNull(),
  /** vale | cuenta_corriente | reintegro */
  forma: text("forma").notNull(),
  valeId: integer("vale_id"),
  motivo: text("motivo").notNull(),
  usuarioId: integer("usuario_id"),
});

/** Presupuestos: se convierten en venta. Si vencieron, los precios se recalculan con la cotización del día. */
export const presupuestos = sqliteTable("presupuestos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numero: integer("numero").notNull().unique(),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  vence: integer("vence", { mode: "timestamp_ms" }).notNull(),
  clienteId: integer("cliente_id"),
  vendedorId: integer("vendedor_id").notNull(),
  /** JSON con los renglones (pieza + precio de ese día). */
  items: text("items").notNull(),
  listaId: integer("lista_id"),
  descuentoPct: integer("descuento_pct").notNull().default(0),
  total: integer("total").notNull(),
  cotizaciones: text("cotizaciones"),
  /** vigente | convertido | anulado */
  estado: text("estado").notNull().default("vigente"),
  ventaId: integer("venta_id"),
  notas: text("notas"),
});

/** Reservas de piezas (con o sin seña) con fecha límite. */
export const reservas = sqliteTable("reservas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  vence: integer("vence", { mode: "timestamp_ms" }).notNull(),
  /** true: se respeta el precio del día de la reserva; false: se cobra al precio del día del retiro. */
  precioCongelado: integer("precio_congelado", { mode: "boolean" }).notNull().default(true),
  /** activa | convertida | vencida | cancelada */
  estado: text("estado").notNull().default("activa"),
  ventaId: integer("venta_id"),
  notas: text("notas"),
  usuarioId: integer("usuario_id"),
});

export const reservaItems = sqliteTable("reserva_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reservaId: integer("reserva_id").notNull().references(() => reservas.id),
  productoId: integer("producto_id").notNull().references(() => productos.id),
  precioPactado: integer("precio_pactado").notNull(),
  estadoPrevio: text("estado_previo").notNull(),
});

/** Pedidos a medida. */
export const pedidos = sqliteTable("pedidos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numero: integer("numero").notNull().unique(),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  descripcion: text("descripcion").notNull(),
  leyId: integer("ley_id"),
  piedras: text("piedras"),
  talle: text("talle"),
  /** congelado (precio pactado) | cotizacion (gramos × gramo del día de entrega + hechura) */
  modoPrecio: text("modo_precio").notNull().default("congelado"),
  presupuesto: integer("presupuesto").notNull(),
  gramosEstimadosMg: integer("gramos_estimados_mg"),
  hechura: integer("hechura").notNull().default(0),
  entregaEstimada: integer("entrega_estimada", { mode: "timestamp_ms" }),
  /** presupuestado | aprobado | en_taller | listo | entregado | cancelado */
  estado: text("estado").notNull().default("presupuestado"),
  proveedorId: integer("proveedor_id"),
  costoTaller: integer("costo_taller"),
  metalEntregadoMg: integer("metal_entregado_mg").notNull().default(0),
  metalDevueltoMg: integer("metal_devuelto_mg").notNull().default(0),
  pesoFinalMg: integer("peso_final_mg"),
  cotizaciones: text("cotizaciones"),
  ventaId: integer("venta_id"),
  notas: text("notas"),
  usuarioId: integer("usuario_id"),
});

/** Reparaciones y servicios. */
export const reparaciones = sqliteTable("reparaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numero: integer("numero").notNull().unique(),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  fechaIngreso: integer("fecha_ingreso", { mode: "timestamp_ms" }).notNull(),
  descripcion: text("descripcion").notNull(),
  /** JSON: ["soldadura","talle","engarzado","limpieza","grabado","otro"] */
  trabajos: text("trabajos").notNull(),
  detalle: text("detalle"),
  pesoIngresoMg: integer("peso_ingreso_mg"),
  presupuesto: integer("presupuesto"),
  fechaPrometida: integer("fecha_prometida", { mode: "timestamp_ms" }),
  /** recibida | en_taller | lista | avisada | entregada | abandonada */
  estado: text("estado").notNull().default("recibida"),
  proveedorId: integer("proveedor_id"),
  enviadaTallerEn: integer("enviada_taller_en", { mode: "timestamp_ms" }),
  costoTaller: integer("costo_taller"),
  listaEn: integer("lista_en", { mode: "timestamp_ms" }),
  entregadaEn: integer("entregada_en", { mode: "timestamp_ms" }),
  ventaId: integer("venta_id"),
  notas: text("notas"),
  usuarioId: integer("usuario_id"),
});

/** Historial de estados de pedidos y reparaciones. */
export const historialEstados = sqliteTable(
  "historial_estados",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entidad: text("entidad").notNull(),
    entidadId: integer("entidad_id").notNull(),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    estado: text("estado").notNull(),
    nota: text("nota"),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("historial_entidad_idx").on(t.entidad, t.entidadId)],
);

/** Fotos de pedidos (referencias) y reparaciones (estado al ingreso). */
export const adjuntos = sqliteTable(
  "adjuntos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entidad: text("entidad").notNull(),
    entidadId: integer("entidad_id").notNull(),
    archivo: text("archivo").notNull(),
    creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("adjuntos_entidad_idx").on(t.entidad, t.entidadId)],
);

// ─────────────────────────── Módulo 6: tesorería ───────────────────────────

/**
 * Cajas y cuentas: efectivo (pesos, dólares, euros), bancos, billeteras virtuales, tarjetas a acreditar y
 * cheques en cartera. Cada caja tiene UNA moneda; su saldo es la suma de sus movimientos no anulados.
 */
export const cajas = sqliteTable("cajas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  /** efectivo | banco | billetera | tarjetas | cheques */
  tipo: text("tipo").notNull(),
  moneda: text("moneda").notNull().default("ARS"),
  /** Se abre y se cierra todos los días con arqueo (cajas de efectivo del local). */
  arqueo: integer("arqueo", { mode: "boolean" }).notNull().default(false),
  /** Tarjetas: días hasta la acreditación y comisión/retención estimadas de la procesadora (centésimos de punto). */
  diasAcreditacion: integer("dias_acreditacion").notNull().default(0),
  comisionPct: integer("comision_pct").notNull().default(0),
  retencionPct: integer("retencion_pct").notNull().default(0),
  /** Tarjetas: banco donde acredita la procesadora. */
  bancoId: integer("banco_id"),
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/** Categorías de gastos e ingresos varios (alquiler, sueldos, servicios…). */
export const categoriasTesoreria = sqliteTable("categorias_tesoreria", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  /** gasto | ingreso */
  tipo: text("tipo").notNull(),
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * Libro de cada caja. importe > 0 entra, < 0 sale, en la moneda de la caja.
 * tipo: saldo_inicial | cobro | pago_proveedor | gasto | ingreso | transferencia | cambio | arqueo | acreditacion |
 *       cheque | reintegro | devolucion_sena
 * referencia: de dónde viene (cobro:ID, pago:ID, cheque:ID, acreditacion:ID, devolucion:ID…).
 * grupo: une las dos patas de una transferencia o de una compra/venta de divisas.
 */
export const movimientosCaja = sqliteTable(
  "movimientos_caja",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cajaId: integer("caja_id").notNull().references(() => cajas.id),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    tipo: text("tipo").notNull(),
    importe: integer("importe").notNull(),
    descripcion: text("descripcion").notNull(),
    referencia: text("referencia"),
    categoriaId: integer("categoria_id"),
    grupo: text("grupo"),
    /** Pesos por unidad de divisa (millonésimos), en compra/venta de divisas. */
    tipoCambio: integer("tipo_cambio"),
    conciliado: integer("conciliado", { mode: "boolean" }).notNull().default(false),
    conciliadoEn: integer("conciliado_en", { mode: "timestamp_ms" }),
    anulado: integer("anulado", { mode: "boolean" }).notNull().default(false),
    usuarioId: integer("usuario_id"),
  },
  (t) => [index("mov_caja_caja_fecha_idx").on(t.cajaId, t.fecha), index("mov_caja_referencia_idx").on(t.referencia)],
);

/** Apertura y cierre diario de las cajas de efectivo, con lo esperado y lo contado. */
export const arqueos = sqliteTable(
  "arqueos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cajaId: integer("caja_id").notNull().references(() => cajas.id),
    /** aaaa-mm-dd (día en Argentina) */
    dia: text("dia").notNull(),
    aperturaEn: integer("apertura_en", { mode: "timestamp_ms" }),
    aperturaUsuarioId: integer("apertura_usuario_id"),
    esperadoApertura: integer("esperado_apertura"),
    contadoApertura: integer("contado_apertura"),
    cierreEn: integer("cierre_en", { mode: "timestamp_ms" }),
    cierreUsuarioId: integer("cierre_usuario_id"),
    esperadoCierre: integer("esperado_cierre"),
    contadoCierre: integer("contado_cierre"),
    notas: text("notas"),
  },
  (t) => [uniqueIndex("arqueo_caja_dia").on(t.cajaId, t.dia)],
);

/** Cobros con tarjeta (débito/crédito) que la procesadora acredita después, con su comisión y retención. */
export const acreditaciones = sqliteTable("acreditaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cobroId: integer("cobro_id").notNull(),
  cajaId: integer("caja_id").notNull(),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  cuotas: integer("cuotas"),
  bruto: integer("bruto").notNull(),
  fechaEsperada: integer("fecha_esperada", { mode: "timestamp_ms" }).notNull(),
  /** pendiente | acreditada | anulada */
  estado: text("estado").notNull().default("pendiente"),
  fechaReal: integer("fecha_real", { mode: "timestamp_ms" }),
  comision: integer("comision"),
  retencion: integer("retencion"),
  neto: integer("neto"),
  bancoId: integer("banco_id"),
});

/** Cheques de terceros (recibidos) y propios (emitidos). */
export const cheques = sqliteTable("cheques", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** tercero | propio */
  tipo: text("tipo").notNull(),
  numero: text("numero").notNull(),
  banco: text("banco").notNull(),
  librador: text("librador"),
  cuit: text("cuit"),
  importe: integer("importe").notNull(),
  fechaEmision: integer("fecha_emision", { mode: "timestamp_ms" }).notNull(),
  fechaPago: integer("fecha_pago", { mode: "timestamp_ms" }).notNull(),
  /** tercero: en_cartera | depositado | endosado | rechazado ; propio: emitido | debitado | anulado */
  estado: text("estado").notNull(),
  clienteId: integer("cliente_id"),
  proveedorId: integer("proveedor_id"),
  /** tercero: banco donde se depositó; propio: banco de la chequera. */
  bancoCajaId: integer("banco_caja_id"),
  pagoId: integer("pago_id"),
  notas: text("notas"),
  creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull(),
  usuarioId: integer("usuario_id"),
});

/** Renglones de extractos bancarios importados para conciliar. */
export const extractoLineas = sqliteTable("extracto_lineas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cajaId: integer("caja_id").notNull(),
  importacion: text("importacion").notNull(),
  fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
  descripcion: text("descripcion").notNull(),
  importe: integer("importe").notNull(),
  movimientoId: integer("movimiento_id"),
  creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull(),
});

// ─────────────────────────── Módulo 7: facturación electrónica ───────────────────────────

/** Puntos de venta habilitados en ARCA para factura electrónica (web services). */
export const puntosVenta = sqliteTable("puntos_venta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numero: integer("numero").notNull().unique(),
  nombre: text("nombre").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  porDefecto: integer("por_defecto", { mode: "boolean" }).notNull().default(false),
});

/**
 * Comprobantes fiscales (facturas, notas de crédito y de débito). Se crean «pendientes» y pasan a «autorizado» cuando
 * ARCA devuelve el CAE; si ARCA rechaza, quedan «rechazados» con el motivo, y si no hubo respuesta, «pendientes» para
 * reintentar. El número se pide a ARCA (último autorizado + 1): la numeración la controla ARCA.
 */
export const comprobantesFiscales = sqliteTable(
  "comprobantes_fiscales",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ventaId: integer("venta_id"),
    /** Código ARCA: 1/6/11 factura A/B/C · 2/7/12 nota de débito · 3/8/13 nota de crédito */
    tipo: integer("tipo").notNull(),
    letra: text("letra").notNull(),
    /** 1 productos · 2 servicios (reparaciones) · 3 productos y servicios */
    concepto: integer("concepto").notNull().default(1),
    puntoVenta: integer("punto_venta").notNull(),
    numero: integer("numero"),
    fecha: integer("fecha", { mode: "timestamp_ms" }).notNull(),
    clienteId: integer("cliente_id"),
    /** 80 CUIT · 86 CUIL · 96 DNI · 99 sin identificar */
    docTipo: integer("doc_tipo").notNull(),
    docNro: text("doc_nro").notNull(),
    receptor: text("receptor").notNull(),
    /** Condición frente al IVA del receptor (código ARCA, RG 5616). */
    condicionIvaReceptor: integer("condicion_iva_receptor").notNull(),
    neto: integer("neto").notNull(),
    iva: integer("iva").notNull(),
    exento: integer("exento").notNull().default(0),
    noGravado: integer("no_gravado").notNull().default(0),
    total: integer("total").notNull(),
    /** JSON [{ id: 5, base, importe }] (alícuotas en códigos ARCA) */
    ivas: text("ivas").notNull().default("[]"),
    /** JSON del detalle impreso: [{ descripcion, cantidad, unitario, subtotal, ivaPct, tratamiento }] */
    detalle: text("detalle").notNull().default("[]"),
    observaciones: text("observaciones"),
    cae: text("cae"),
    caeVence: integer("cae_vence", { mode: "timestamp_ms" }),
    /** pendiente | autorizado | rechazado */
    estado: text("estado").notNull().default("pendiente"),
    errores: text("errores"),
    intentos: integer("intentos").notNull().default(0),
    ultimoIntento: integer("ultimo_intento", { mode: "timestamp_ms" }),
    /** Comprobante al que se asocia (las notas de crédito/débito). */
    asociadoId: integer("asociado_id"),
    motivo: text("motivo"),
    /** simulado | homologacion | produccion */
    ambiente: text("ambiente").notNull(),
    usuarioId: integer("usuario_id"),
    creadoEn: integer("creado_en", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("cf_venta_idx").on(t.ventaId), uniqueIndex("cf_numero_unico").on(t.ambiente, t.tipo, t.puntoVenta, t.numero)],
);

/** Ticket de acceso a ARCA (WSAA): dura unas 12 horas y se reutiliza. */
export const arcaTokens = sqliteTable("arca_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ambiente: text("ambiente").notNull(),
  servicio: text("servicio").notNull(),
  token: text("token").notNull(),
  sign: text("sign").notNull(),
  vence: integer("vence", { mode: "timestamp_ms" }).notNull(),
});

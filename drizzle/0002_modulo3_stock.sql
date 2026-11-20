CREATE TABLE `categorias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`prefijo` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categorias_nombre_unique` ON `categorias` (`nombre`);--> statement-breakpoint
CREATE TABLE `historial_precios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`lista_antes` integer,
	`lista_despues` integer,
	`oferta_antes` integer,
	`oferta_despues` integer,
	`moneda` text NOT NULL,
	`motivo` text NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `historial_precios_producto_idx` ON `historial_precios` (`producto_id`);--> statement-breakpoint
CREATE TABLE `inventario_lecturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventario_id` integer NOT NULL,
	`codigo` text NOT NULL,
	`producto_id` integer,
	`fecha` integer NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`inventario_id`) REFERENCES `inventarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lecturas_inventario_idx` ON `inventario_lecturas` (`inventario_id`);--> statement-breakpoint
CREATE TABLE `inventarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`ubicacion_id` integer,
	`iniciado_en` integer NOT NULL,
	`cerrado_en` integer,
	`usuario_id` integer,
	`resultado` text
);
--> statement-breakpoint
CREATE TABLE `listas_precios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`ajuste_pct` integer DEFAULT 0 NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listas_precios_nombre_unique` ON `listas_precios` (`nombre`);--> statement-breakpoint
CREATE TABLE `movimientos_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`tipo` text NOT NULL,
	`cantidad` integer DEFAULT 0 NOT NULL,
	`stock_resultante` integer,
	`estado_antes` text,
	`estado_despues` text,
	`ubicacion_antes` integer,
	`ubicacion_despues` integer,
	`motivo` text,
	`documento` text,
	`usuario_id` integer,
	`autorizado_por` integer,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movimientos_producto_idx` ON `movimientos_stock` (`producto_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `producto_fotos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`archivo` text NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`ancho` integer,
	`alto` integer,
	`activa` integer DEFAULT true NOT NULL,
	`creada_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `producto_piedras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`cantidad` integer DEFAULT 1 NOT NULL,
	`quilates` integer,
	`calidad` text,
	`certificado` text,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `productos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`codigo_barras` text,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`categoria_id` integer,
	`coleccion` text,
	`artesano` text,
	`ley_id` integer,
	`metal_detalle` text,
	`peso_bruto_mg` integer,
	`peso_neto_mg` integer,
	`medidas` text,
	`talle` text,
	`descripcion` text,
	`notas_internas` text,
	`costo_metal` integer DEFAULT 0 NOT NULL,
	`costo_mano_obra` integer DEFAULT 0 NOT NULL,
	`costo_piedras` integer DEFAULT 0 NOT NULL,
	`costo_otros` integer DEFAULT 0 NOT NULL,
	`moneda_costo` text DEFAULT 'ARS' NOT NULL,
	`modo_precio` text DEFAULT 'fijo' NOT NULL,
	`precio_lista` integer DEFAULT 0 NOT NULL,
	`precio_oferta` integer,
	`moneda_precio` text DEFAULT 'ARS' NOT NULL,
	`hechura` integer DEFAULT 0 NOT NULL,
	`iva_pct` integer DEFAULT 2100 NOT NULL,
	`origen` text NOT NULL,
	`consignante` text,
	`ubicacion_id` integer,
	`estado` text DEFAULT 'disponible' NOT NULL,
	`cantidad` integer DEFAULT 1 NOT NULL,
	`stock_minimo` integer DEFAULT 0 NOT NULL,
	`precio_actualizado_en` integer,
	`es_demo` integer DEFAULT false NOT NULL,
	`creado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`actualizado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ley_id`) REFERENCES `leyes_metal`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ubicacion_id`) REFERENCES `ubicaciones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productos_codigo_unique` ON `productos` (`codigo`);--> statement-breakpoint
CREATE UNIQUE INDEX `productos_codigo_barras_unique` ON `productos` (`codigo_barras`);--> statement-breakpoint
CREATE INDEX `productos_estado_idx` ON `productos` (`estado`);--> statement-breakpoint
CREATE INDEX `productos_categoria_idx` ON `productos` (`categoria_id`);--> statement-breakpoint
CREATE INDEX `productos_nombre_idx` ON `productos` (`nombre`);--> statement-breakpoint
CREATE TABLE `salidas_piezas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`destino` text NOT NULL,
	`detalle` text NOT NULL,
	`responsable` text,
	`fecha_salida` integer NOT NULL,
	`devolucion_esperada` integer NOT NULL,
	`devuelta_en` integer,
	`estado_previo` text NOT NULL,
	`usuario_id` integer,
	`notas` text,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ubicaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ubicaciones_nombre_unique` ON `ubicaciones` (`nombre`);
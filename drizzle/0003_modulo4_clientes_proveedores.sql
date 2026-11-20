CREATE TABLE `cliente_deseos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`producto_id` integer,
	`descripcion` text NOT NULL,
	`fecha` integer NOT NULL,
	`cumplido` integer DEFAULT false NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`tipo_doc` text,
	`documento` text,
	`condicion_iva` text DEFAULT 'consumidor_final' NOT NULL,
	`domicilio` text,
	`localidad` text,
	`provincia` text,
	`telefono` text,
	`whatsapp` text,
	`email` text,
	`cumpleanos` text,
	`aniversario` text,
	`talles` text,
	`preferencias` text,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL,
	`es_demo` integer DEFAULT false NOT NULL,
	`creado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`actualizado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_documento_unique` ON `clientes` (`documento`);--> statement-breakpoint
CREATE INDEX `clientes_nombre_idx` ON `clientes` (`nombre`);--> statement-breakpoint
CREATE INDEX `clientes_whatsapp_idx` ON `clientes` (`whatsapp`);--> statement-breakpoint
CREATE TABLE `compra_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`compra_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`producto_id` integer,
	`producto_nuevo` integer DEFAULT false NOT NULL,
	`descripcion` text NOT NULL,
	`cantidad` integer DEFAULT 1 NOT NULL,
	`ley_id` integer,
	`peso_mg` integer,
	`costo_unitario` integer NOT NULL,
	`iva_pct` integer DEFAULT 2100 NOT NULL,
	`subtotal` integer NOT NULL,
	FOREIGN KEY (`compra_id`) REFERENCES `compras`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `compras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`tipo_comprobante` text NOT NULL,
	`punto_venta` integer,
	`numero` integer,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`tipo_cambio` integer NOT NULL,
	`neto` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`percepcion_iva` integer DEFAULT 0 NOT NULL,
	`percepcion_iibb` integer DEFAULT 0 NOT NULL,
	`otros_impuestos` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`condicion` text NOT NULL,
	`vencimiento` integer,
	`notas` text,
	`cotizaciones` text,
	`anulada` integer DEFAULT false NOT NULL,
	`anulada_por` integer,
	`motivo_anulacion` text,
	`usuario_id` integer,
	`creada_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compras_proveedor_idx` ON `compras` (`proveedor_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `consignacion_entregada_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`consignacion_id` integer NOT NULL,
	`producto_id` integer NOT NULL,
	`precio_acordado` integer NOT NULL,
	`estado` text DEFAULT 'entregada' NOT NULL,
	`resuelto_en` integer,
	FOREIGN KEY (`consignacion_id`) REFERENCES `consignaciones_entregadas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `consignaciones_entregadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`notas` text,
	`usuario_id` integer,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `movimientos_cc_clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`tipo` text NOT NULL,
	`importe` integer NOT NULL,
	`vencimiento` integer,
	`descripcion` text NOT NULL,
	`documento` text,
	`anulado` integer DEFAULT false NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cc_clientes_idx` ON `movimientos_cc_clientes` (`cliente_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `movimientos_cc_proveedores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`tipo` text NOT NULL,
	`moneda` text NOT NULL,
	`importe` integer NOT NULL,
	`vencimiento` integer,
	`descripcion` text NOT NULL,
	`compra_id` integer,
	`pago_id` integer,
	`anulado` integer DEFAULT false NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cc_proveedores_idx` ON `movimientos_cc_proveedores` (`proveedor_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `movimientos_metal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer NOT NULL,
	`ley_id` integer NOT NULL,
	`peso_mg` integer NOT NULL,
	`tipo` text NOT NULL,
	`costo` integer,
	`compra_id` integer,
	`descripcion` text NOT NULL,
	`anulado` integer DEFAULT false NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`ley_id`) REFERENCES `leyes_metal`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `metal_ley_idx` ON `movimientos_metal` (`ley_id`);--> statement-breakpoint
CREATE TABLE `pago_imputaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pago_id` integer NOT NULL,
	`compra_id` integer NOT NULL,
	`importe` integer NOT NULL,
	FOREIGN KEY (`pago_id`) REFERENCES `pagos_proveedores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`compra_id`) REFERENCES `compras`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pagos_proveedores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`sentido` text DEFAULT 'pago' NOT NULL,
	`moneda` text NOT NULL,
	`importe` integer NOT NULL,
	`medio` text NOT NULL,
	`tipo_cambio` integer NOT NULL,
	`caja_id` integer,
	`notas` text,
	`anulado` integer DEFAULT false NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proveedores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`razon_social` text NOT NULL,
	`nombre_fantasia` text,
	`cuit` text,
	`condicion_iva` text DEFAULT 'responsable_inscripto' NOT NULL,
	`rubros` text DEFAULT '[]' NOT NULL,
	`contacto` text,
	`telefono` text,
	`whatsapp` text,
	`email` text,
	`domicilio` text,
	`condiciones_pago` text,
	`dias_pago` integer DEFAULT 0 NOT NULL,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL,
	`es_demo` integer DEFAULT false NOT NULL,
	`creado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proveedores_cuit_unique` ON `proveedores` (`cuit`);--> statement-breakpoint
ALTER TABLE `productos` ADD `proveedor_id` integer;
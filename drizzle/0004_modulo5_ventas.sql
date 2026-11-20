CREATE TABLE `adjuntos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidad` text NOT NULL,
	`entidad_id` integer NOT NULL,
	`archivo` text NOT NULL,
	`creado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `adjuntos_entidad_idx` ON `adjuntos` (`entidad`,`entidad_id`);--> statement-breakpoint
CREATE TABLE `canjes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venta_id` integer,
	`cliente_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`ley_id` integer NOT NULL,
	`peso_mg` integer NOT NULL,
	`precio_gramo` integer NOT NULL,
	`valor` integer NOT NULL,
	`descripcion` text NOT NULL,
	`destino` text NOT NULL,
	`producto_id` integer,
	`anulado` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cobros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer NOT NULL,
	`cliente_id` integer,
	`venta_id` integer,
	`origen` text NOT NULL,
	`referencia` text,
	`medio_id` integer NOT NULL,
	`medio_tipo` text NOT NULL,
	`moneda` text NOT NULL,
	`importe` integer NOT NULL,
	`tipo_cambio` integer NOT NULL,
	`aplicado` integer NOT NULL,
	`recargo` integer DEFAULT 0 NOT NULL,
	`cuotas` integer,
	`vale_id` integer,
	`caja_id` integer,
	`anulado` integer DEFAULT false NOT NULL,
	`usuario_id` integer
);
--> statement-breakpoint
CREATE INDEX `cobros_fecha_idx` ON `cobros` (`fecha`);--> statement-breakpoint
CREATE INDEX `cobros_venta_idx` ON `cobros` (`venta_id`);--> statement-breakpoint
CREATE TABLE `devoluciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venta_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`items` text NOT NULL,
	`importe` integer NOT NULL,
	`forma` text NOT NULL,
	`vale_id` integer,
	`motivo` text NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `historial_estados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidad` text NOT NULL,
	`entidad_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`estado` text NOT NULL,
	`nota` text,
	`usuario_id` integer
);
--> statement-breakpoint
CREATE INDEX `historial_entidad_idx` ON `historial_estados` (`entidad`,`entidad_id`);--> statement-breakpoint
CREATE TABLE `medios_pago` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`ajuste_pct` integer DEFAULT 0 NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `medios_pago_nombre_unique` ON `medios_pago` (`nombre`);--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` integer NOT NULL,
	`cliente_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`descripcion` text NOT NULL,
	`ley_id` integer,
	`piedras` text,
	`talle` text,
	`modo_precio` text DEFAULT 'congelado' NOT NULL,
	`presupuesto` integer NOT NULL,
	`gramos_estimados_mg` integer,
	`hechura` integer DEFAULT 0 NOT NULL,
	`entrega_estimada` integer,
	`estado` text DEFAULT 'presupuestado' NOT NULL,
	`proveedor_id` integer,
	`costo_taller` integer,
	`metal_entregado_mg` integer DEFAULT 0 NOT NULL,
	`metal_devuelto_mg` integer DEFAULT 0 NOT NULL,
	`peso_final_mg` integer,
	`cotizaciones` text,
	`venta_id` integer,
	`notas` text,
	`usuario_id` integer,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pedidos_numero_unique` ON `pedidos` (`numero`);--> statement-breakpoint
CREATE TABLE `planes_cuotas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medio_id` integer NOT NULL,
	`cuotas` integer NOT NULL,
	`recargo_pct` integer DEFAULT 0 NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`medio_id`) REFERENCES `medios_pago`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `presupuestos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` integer NOT NULL,
	`fecha` integer NOT NULL,
	`vence` integer NOT NULL,
	`cliente_id` integer,
	`vendedor_id` integer NOT NULL,
	`items` text NOT NULL,
	`lista_id` integer,
	`descuento_pct` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`cotizaciones` text,
	`estado` text DEFAULT 'vigente' NOT NULL,
	`venta_id` integer,
	`notas` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presupuestos_numero_unique` ON `presupuestos` (`numero`);--> statement-breakpoint
CREATE TABLE `reparaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` integer NOT NULL,
	`cliente_id` integer NOT NULL,
	`fecha_ingreso` integer NOT NULL,
	`descripcion` text NOT NULL,
	`trabajos` text NOT NULL,
	`detalle` text,
	`peso_ingreso_mg` integer,
	`presupuesto` integer,
	`fecha_prometida` integer,
	`estado` text DEFAULT 'recibida' NOT NULL,
	`proveedor_id` integer,
	`enviada_taller_en` integer,
	`costo_taller` integer,
	`lista_en` integer,
	`entregada_en` integer,
	`venta_id` integer,
	`notas` text,
	`usuario_id` integer,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reparaciones_numero_unique` ON `reparaciones` (`numero`);--> statement-breakpoint
CREATE TABLE `reserva_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reserva_id` integer NOT NULL,
	`producto_id` integer NOT NULL,
	`precio_pactado` integer NOT NULL,
	`estado_previo` text NOT NULL,
	FOREIGN KEY (`reserva_id`) REFERENCES `reservas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reservas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`vence` integer NOT NULL,
	`precio_congelado` integer DEFAULT true NOT NULL,
	`estado` text DEFAULT 'activa' NOT NULL,
	`venta_id` integer,
	`notas` text,
	`usuario_id` integer,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vale_movimientos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vale_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`importe` integer NOT NULL,
	`venta_id` integer,
	`descripcion` text NOT NULL,
	FOREIGN KEY (`vale_id`) REFERENCES `vales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`tipo` text NOT NULL,
	`cliente_id` integer,
	`monto` integer NOT NULL,
	`saldo` integer NOT NULL,
	`vence` integer,
	`venta_origen_id` integer,
	`anulado` integer DEFAULT false NOT NULL,
	`creado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vales_codigo_unique` ON `vales` (`codigo`);--> statement-breakpoint
CREATE TABLE `venta_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venta_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`producto_id` integer,
	`pieza_unica` integer DEFAULT false NOT NULL,
	`descripcion` text NOT NULL,
	`cantidad` integer DEFAULT 1 NOT NULL,
	`precio_unitario` integer NOT NULL,
	`subtotal` integer NOT NULL,
	`costo_unitario` integer DEFAULT 0 NOT NULL,
	`iva_pct` integer DEFAULT 2100 NOT NULL,
	`referencia` text,
	`devueltos` integer DEFAULT 0 NOT NULL,
	`liberado` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `venta_items_venta_idx` ON `venta_items` (`venta_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pieza_unica_vendida_una_vez` ON `venta_items` (`producto_id`) WHERE pieza_unica = 1 and liberado = 0;--> statement-breakpoint
CREATE TABLE `ventas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` integer NOT NULL,
	`fecha` integer NOT NULL,
	`cliente_id` integer,
	`vendedor_id` integer NOT NULL,
	`tipo_comprobante` text DEFAULT 'factura' NOT NULL,
	`estado_fiscal` text DEFAULT 'pendiente' NOT NULL,
	`lista_id` integer,
	`subtotal` integer NOT NULL,
	`descuento_pct` integer DEFAULT 0 NOT NULL,
	`descuento` integer DEFAULT 0 NOT NULL,
	`canje` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`recargos` integer DEFAULT 0 NOT NULL,
	`a_cuenta_corriente` integer DEFAULT 0 NOT NULL,
	`comision_pct` integer DEFAULT 0 NOT NULL,
	`comision` integer DEFAULT 0 NOT NULL,
	`garantia_meses` integer DEFAULT 0 NOT NULL,
	`autorizo_descuento` integer,
	`cotizaciones` text,
	`notas` text,
	`presupuesto_id` integer,
	`reserva_id` integer,
	`anulada` integer DEFAULT false NOT NULL,
	`anulada_por` integer,
	`motivo_anulacion` text,
	`es_demo` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ventas_numero_unique` ON `ventas` (`numero`);--> statement-breakpoint
CREATE INDEX `ventas_fecha_idx` ON `ventas` (`fecha`);--> statement-breakpoint
CREATE INDEX `ventas_cliente_idx` ON `ventas` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `ventas_vendedor_idx` ON `ventas` (`vendedor_id`);
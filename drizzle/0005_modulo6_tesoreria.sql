CREATE TABLE `acreditaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cobro_id` integer NOT NULL,
	`caja_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`cuotas` integer,
	`bruto` integer NOT NULL,
	`fecha_esperada` integer NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`fecha_real` integer,
	`comision` integer,
	`retencion` integer,
	`neto` integer,
	`banco_id` integer
);
--> statement-breakpoint
CREATE TABLE `arqueos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caja_id` integer NOT NULL,
	`dia` text NOT NULL,
	`apertura_en` integer,
	`apertura_usuario_id` integer,
	`esperado_apertura` integer,
	`contado_apertura` integer,
	`cierre_en` integer,
	`cierre_usuario_id` integer,
	`esperado_cierre` integer,
	`contado_cierre` integer,
	`notas` text,
	FOREIGN KEY (`caja_id`) REFERENCES `cajas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arqueo_caja_dia` ON `arqueos` (`caja_id`,`dia`);--> statement-breakpoint
CREATE TABLE `cajas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`arqueo` integer DEFAULT false NOT NULL,
	`dias_acreditacion` integer DEFAULT 0 NOT NULL,
	`comision_pct` integer DEFAULT 0 NOT NULL,
	`retencion_pct` integer DEFAULT 0 NOT NULL,
	`banco_id` integer,
	`activa` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cajas_nombre_unique` ON `cajas` (`nombre`);--> statement-breakpoint
CREATE TABLE `categorias_tesoreria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`activa` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cheques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`numero` text NOT NULL,
	`banco` text NOT NULL,
	`librador` text,
	`cuit` text,
	`importe` integer NOT NULL,
	`fecha_emision` integer NOT NULL,
	`fecha_pago` integer NOT NULL,
	`estado` text NOT NULL,
	`cliente_id` integer,
	`proveedor_id` integer,
	`banco_caja_id` integer,
	`pago_id` integer,
	`notas` text,
	`creado_en` integer NOT NULL,
	`usuario_id` integer
);
--> statement-breakpoint
CREATE TABLE `extracto_lineas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caja_id` integer NOT NULL,
	`importacion` text NOT NULL,
	`fecha` integer NOT NULL,
	`descripcion` text NOT NULL,
	`importe` integer NOT NULL,
	`movimiento_id` integer,
	`creado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movimientos_caja` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caja_id` integer NOT NULL,
	`fecha` integer NOT NULL,
	`tipo` text NOT NULL,
	`importe` integer NOT NULL,
	`descripcion` text NOT NULL,
	`referencia` text,
	`categoria_id` integer,
	`grupo` text,
	`tipo_cambio` integer,
	`conciliado` integer DEFAULT false NOT NULL,
	`conciliado_en` integer,
	`anulado` integer DEFAULT false NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`caja_id`) REFERENCES `cajas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mov_caja_caja_fecha_idx` ON `movimientos_caja` (`caja_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `mov_caja_referencia_idx` ON `movimientos_caja` (`referencia`);--> statement-breakpoint
ALTER TABLE `medios_pago` ADD `caja_id` integer;
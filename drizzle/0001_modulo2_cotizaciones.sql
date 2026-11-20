CREATE TABLE `actualizaciones_cotizacion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer NOT NULL,
	`origen` text NOT NULL,
	`usuario_id` integer,
	`actualizadas` integer NOT NULL,
	`con_respaldo` integer NOT NULL,
	`fallidas` integer NOT NULL,
	`detalle` text NOT NULL,
	`duracion_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `actualizaciones_fecha_idx` ON `actualizaciones_cotizacion` (`fecha`);--> statement-breakpoint
CREATE TABLE `alertas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer NOT NULL,
	`tipo` text NOT NULL,
	`nivel` text NOT NULL,
	`titulo` text NOT NULL,
	`detalle` text,
	`clave` text,
	`leida_en` integer,
	`leida_por` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alertas_clave_unique` ON `alertas` (`clave`);--> statement-breakpoint
CREATE INDEX `alertas_fecha_idx` ON `alertas` (`fecha`);--> statement-breakpoint
CREATE TABLE `cotizaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`compra` integer NOT NULL,
	`venta` integer NOT NULL,
	`fuente` text NOT NULL,
	`origen` text NOT NULL,
	`fecha` integer NOT NULL,
	`fecha_fuente` integer,
	`usuario_id` integer,
	`nota` text
);
--> statement-breakpoint
CREATE INDEX `cotizaciones_codigo_fecha_idx` ON `cotizaciones` (`codigo`,`fecha`);--> statement-breakpoint
CREATE TABLE `cotizaciones_estado` (
	`codigo` text PRIMARY KEY NOT NULL,
	`ultimo_intento` integer,
	`ultimo_ok` integer,
	`fuente` text,
	`es_respaldo` integer DEFAULT false NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `cotizaciones_fijas` (
	`codigo` text PRIMARY KEY NOT NULL,
	`compra` integer NOT NULL,
	`venta` integer NOT NULL,
	`desde` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`nota` text
);
--> statement-breakpoint
CREATE TABLE `leyes_metal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`metal` text NOT NULL,
	`quilates` integer,
	`milesimos` integer NOT NULL,
	`ajuste_venta_pct` integer DEFAULT 0 NOT NULL,
	`ajuste_compra_pct` integer DEFAULT 0 NOT NULL,
	`precio_manual_gramo` integer,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leyes_metal_nombre_unique` ON `leyes_metal` (`nombre`);
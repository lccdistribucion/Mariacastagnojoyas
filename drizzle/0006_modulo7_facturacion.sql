CREATE TABLE `arca_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ambiente` text NOT NULL,
	`servicio` text NOT NULL,
	`token` text NOT NULL,
	`sign` text NOT NULL,
	`vence` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comprobantes_fiscales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venta_id` integer,
	`tipo` integer NOT NULL,
	`letra` text NOT NULL,
	`concepto` integer DEFAULT 1 NOT NULL,
	`punto_venta` integer NOT NULL,
	`numero` integer,
	`fecha` integer NOT NULL,
	`cliente_id` integer,
	`doc_tipo` integer NOT NULL,
	`doc_nro` text NOT NULL,
	`receptor` text NOT NULL,
	`condicion_iva_receptor` integer NOT NULL,
	`neto` integer NOT NULL,
	`iva` integer NOT NULL,
	`exento` integer DEFAULT 0 NOT NULL,
	`no_gravado` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`ivas` text DEFAULT '[]' NOT NULL,
	`detalle` text DEFAULT '[]' NOT NULL,
	`observaciones` text,
	`cae` text,
	`cae_vence` integer,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`errores` text,
	`intentos` integer DEFAULT 0 NOT NULL,
	`ultimo_intento` integer,
	`asociado_id` integer,
	`motivo` text,
	`ambiente` text NOT NULL,
	`usuario_id` integer,
	`creado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cf_venta_idx` ON `comprobantes_fiscales` (`venta_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cf_numero_unico` ON `comprobantes_fiscales` (`ambiente`,`tipo`,`punto_venta`,`numero`);--> statement-breakpoint
CREATE TABLE `puntos_venta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` integer NOT NULL,
	`nombre` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`por_defecto` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `puntos_venta_numero_unique` ON `puntos_venta` (`numero`);--> statement-breakpoint
ALTER TABLE `productos` ADD `tratamiento_iva` text DEFAULT 'general' NOT NULL;
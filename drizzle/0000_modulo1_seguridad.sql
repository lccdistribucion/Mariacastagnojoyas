CREATE TABLE `auditoria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`usuario_id` integer,
	`usuario_nombre` text NOT NULL,
	`accion` text NOT NULL,
	`entidad` text NOT NULL,
	`entidad_id` text,
	`descripcion` text NOT NULL,
	`antes` text,
	`despues` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `auditoria_fecha_idx` ON `auditoria` (`fecha`);--> statement-breakpoint
CREATE INDEX `auditoria_entidad_idx` ON `auditoria` (`entidad`,`entidad_id`);--> statement-breakpoint
CREATE INDEX `auditoria_usuario_idx` ON `auditoria` (`usuario_id`);--> statement-breakpoint
CREATE TABLE `configuracion` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`actualizado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`actualizado_por` integer
);
--> statement-breakpoint
CREATE TABLE `intentos_ingreso` (
	`clave` text PRIMARY KEY NOT NULL,
	`fallos` integer DEFAULT 0 NOT NULL,
	`bloqueado_hasta` integer,
	`actualizado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permisos_usuario` (
	`usuario_id` integer NOT NULL,
	`permiso` text NOT NULL,
	`concedido` integer NOT NULL,
	PRIMARY KEY(`usuario_id`, `permiso`),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sesiones` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` integer NOT NULL,
	`version` integer NOT NULL,
	`creada_en` integer NOT NULL,
	`ultima_actividad` integer NOT NULL,
	`expira_en` integer NOT NULL,
	`cerrada_en` integer,
	`motivo_cierre` text,
	`ip` text,
	`dispositivo` text,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sesiones_usuario_idx` ON `sesiones` (`usuario_id`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario` text NOT NULL,
	`nombre` text NOT NULL,
	`rol` text NOT NULL,
	`clave_hash` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`debe_cambiar_clave` integer DEFAULT false NOT NULL,
	`descuento_max_pct` integer,
	`comision_pct` integer DEFAULT 0 NOT NULL,
	`version_sesion` integer DEFAULT 1 NOT NULL,
	`ultimo_ingreso` integer,
	`creado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`actualizado_en` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_usuario_unique` ON `usuarios` (`usuario`);
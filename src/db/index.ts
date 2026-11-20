/**
 * Conexión única a la base SQLite (archivo `data/maria-castagno.db`).
 * La usan la web, las tareas programadas y los scripts. Toda operación que toca varias tablas
 * va dentro de `db.transaction(...)`: se guarda todo junto o no se guarda nada.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const RUTA_BASE = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "data", "maria-castagno.db")}`;

function crear() {
  if (RUTA_BASE.startsWith("file:")) mkdirSync(path.dirname(RUTA_BASE.slice(5)), { recursive: true });
  const client = createClient({ url: RUTA_BASE });
  // WAL: lecturas y escrituras simultáneas sin trabarse; claves foráneas activas; espera si otro proceso escribe.
  void client.execute("PRAGMA journal_mode = WAL").catch(() => {});
  void client.execute("PRAGMA foreign_keys = ON").catch(() => {});
  void client.execute("PRAGMA busy_timeout = 5000").catch(() => {});
  return client;
}

const global_ = globalThis as unknown as { __mcCliente?: Client };
export const cliente = global_.__mcCliente ?? crear();
if (process.env.NODE_ENV !== "production") global_.__mcCliente = cliente;

export const db = drizzle(cliente, { schema });
export type Db = typeof db;
/** Transacción en curso (o la base misma): las funciones de dominio aceptan cualquiera de las dos. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;
export * from "./schema";

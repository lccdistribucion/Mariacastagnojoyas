/**
 * Aplica las migraciones pendientes. Antes de tocar una base existente guarda una copia en `backups/`.
 * Las migraciones solo agregan (tablas, columnas, índices): nunca borran datos.
 */
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, RUTA_BASE } from "../src/db";
import { crearCopia } from "../src/lib/backup";

async function main() {
  const archivo = RUTA_BASE.startsWith("file:") ? RUTA_BASE.slice(5) : null;
  if (archivo && existsSync(archivo)) {
    const copia = await crearCopia("antes-de-migrar");
    console.log(`Copia de seguridad: ${copia}`);
  }
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Base de datos al día.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

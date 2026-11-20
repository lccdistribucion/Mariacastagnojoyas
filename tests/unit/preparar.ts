/** Base de prueba nueva en una carpeta temporal (cada archivo de pruebas corre en su propio proceso). */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function basePrueba() {
  const dir = mkdtempSync(path.join(tmpdir(), "mc-prueba-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "prueba.db")}`;
  process.env.BACKUPS_DIR = path.join(dir, "backups");
  const { db } = await import("../../src/db");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "../../drizzle") });
  return db;
}

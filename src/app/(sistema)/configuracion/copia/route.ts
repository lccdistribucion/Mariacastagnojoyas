/** Genera una copia de la base en `backups/` y la descarga. Solo administradores. Queda en auditoría. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { actorDe, usuarioActual } from "@/lib/auth/sesion";
import { crearCopia } from "@/lib/backup";

export async function POST() {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  if (!u.permisos.has("configurar_sistema")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const archivo = await crearCopia("manual");
  await db.transaction(async (tx) =>
    auditar(tx, await actorDe(u), { accion: "copia_seguridad", entidad: "sistema", descripcion: `Descargó una copia de seguridad (${path.basename(archivo)})` }),
  );
  return new NextResponse(new Uint8Array(await readFile(archivo)), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${path.basename(archivo)}"`,
      "Cache-Control": "no-store",
    },
  });
}

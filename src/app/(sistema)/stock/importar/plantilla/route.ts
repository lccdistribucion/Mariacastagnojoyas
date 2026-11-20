import { NextResponse } from "next/server";
import { usuarioActual } from "@/lib/auth/sesion";
import { plantilla } from "@/lib/stock/importar";

export async function GET() {
  const u = await usuarioActual();
  if (!u?.permisos.has("cargar_productos")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return new NextResponse(new Uint8Array(await plantilla()), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="plantilla-piezas.xlsx"' },
  });
}

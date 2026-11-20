/** Sirve las fotos de las piezas (solo con sesión). /stock-foto?a=<pieza>/<nombre>&mini=1 */
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth/sesion";
import { leerFoto } from "@/lib/stock/fotos";

export async function GET(req: NextRequest) {
  if (!(await usuarioActual())) return new NextResponse(null, { status: 401 });
  const archivo = req.nextUrl.searchParams.get("a") ?? "";
  const datos = await leerFoto(archivo, req.nextUrl.searchParams.get("mini") === "1");
  if (!datos) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(datos), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

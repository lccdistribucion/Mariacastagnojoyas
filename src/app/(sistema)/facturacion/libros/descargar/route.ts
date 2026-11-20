import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth/sesion";
import { excelLibroCompras, excelLibroVentas } from "@/lib/facturacion/libros";

/** GET /facturacion/libros/descargar?libro=ventas|compras&mes=aaaa-mm */
export async function GET(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return new NextResponse(null, { status: 401 });
  if (!u.permisos.has("ver_ventas_de_todos")) return new NextResponse(null, { status: 403 });
  const libro = req.nextUrl.searchParams.get("libro");
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes) || !["ventas", "compras"].includes(libro ?? "")) return new NextResponse(null, { status: 400 });
  if (libro === "compras" && !u.permisos.has("ver_proveedores")) return new NextResponse(null, { status: 403 });
  const [a, m] = mes.split("-").map(Number);
  const desde = new Date(`${mes}-01T00:00:00-03:00`);
  const hasta = new Date(new Date(`${mes}-01T00:00:00-03:00`).setMonth(new Date(`${mes}-01T12:00:00-03:00`).getMonth() + 1) - 1);
  const titulo = `${String(m).padStart(2, "0")}/${a}`;
  const buf = libro === "ventas" ? await excelLibroVentas(desde, hasta, titulo) : await excelLibroCompras(desde, hasta, titulo);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="libro-iva-${libro}-${mes}.xlsx"` } });
}

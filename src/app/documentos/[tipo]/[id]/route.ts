/** PDF de los documentos: /documentos/{factura|comprobante|remito|garantia|presupuesto|reparacion|pedido}/{id} */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { comprobantesFiscales, db, ventas } from "@/db";
import { pdfComprobanteFiscal } from "@/lib/facturacion/pdf";
import { usuarioActual } from "@/lib/auth/sesion";
import { pdfGarantia, pdfPedido, pdfPresupuesto, pdfReparacion, pdfVenta } from "@/lib/documentos/generadores";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ tipo: string; id: string }> }) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  const { tipo, id: idTxt } = await ctx.params;
  const id = Number(idTxt);
  if (["comprobante", "remito", "garantia"].includes(tipo)) {
    const [v] = await db.select().from(ventas).where(eq(ventas.id, id));
    if (!v) return new NextResponse(null, { status: 404 });
    if (v.tipoComprobante === "interno" && !u.permisos.has("ver_sin_facturar")) return new NextResponse(null, { status: 404 });
    if (v.vendedorId !== u.id && !u.permisos.has("ver_ventas_de_todos")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (tipo === "factura") {
    const [c] = await db.select().from(comprobantesFiscales).where(eq(comprobantesFiscales.id, id));
    if (!c) return new NextResponse(null, { status: 404 });
    const [v] = c.ventaId ? await db.select().from(ventas).where(eq(ventas.id, c.ventaId)) : [];
    if (v ? v.vendedorId !== u.id && !u.permisos.has("ver_ventas_de_todos") : !u.permisos.has("ver_ventas_de_todos")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const pdf =
    tipo === "factura" ? await pdfComprobanteFiscal(id)
    : tipo === "comprobante" ? await pdfVenta(id, "comprobante")
    : tipo === "remito" ? await pdfVenta(id, "remito")
    : tipo === "garantia" ? await pdfGarantia(id)
    : tipo === "presupuesto" ? await pdfPresupuesto(id)
    : tipo === "reparacion" ? await pdfReparacion(id)
    : tipo === "pedido" ? await pdfPedido(id)
    : null;
  if (!pdf) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${tipo}-${id}.pdf"`, "Cache-Control": "no-store" } });
}

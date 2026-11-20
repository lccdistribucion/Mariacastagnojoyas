/** PDF de etiquetas: /stock/etiquetas/pdf?ids=1,2,3&formato=colita|adhesiva|a4&precio=1&copias=1 */
import { NextResponse, type NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { db, leyesMetal, productos } from "@/db";
import { usuarioActual } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { numero } from "@/lib/formato";
import { contextoPrecios, conPrecio } from "@/lib/stock/consultas";
import { pdfEtiquetas, type FormatoEtiqueta } from "@/lib/stock/etiquetas";
import { gramos } from "@/lib/stock/vista";

export async function GET(req: NextRequest) {
  if (!(await usuarioActual())) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get("ids") ?? "").split(",").map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 2000);
  if (!ids.length) return NextResponse.json({ error: "Elegí al menos una pieza" }, { status: 400 });
  const cfg = await leerConfig(["etiquetas.formato", "etiquetas.con_precio"]);
  const formato = (["colita", "adhesiva", "a4"].includes(sp.get("formato") ?? "") ? sp.get("formato") : cfg["etiquetas.formato"]) as FormatoEtiqueta;
  const conPrecioImpreso = sp.has("precio") ? sp.get("precio") === "1" : cfg["etiquetas.con_precio"];
  const copias = Math.min(50, Math.max(1, Number(sp.get("copias")) || 1));
  const [filas, leyes, ctx] = await Promise.all([db.select().from(productos).where(inArray(productos.id, ids)), db.select().from(leyesMetal), contextoPrecios()]);
  const items = ids
    .map((id) => filas.find((f) => f.id === id))
    .filter((p): p is (typeof filas)[number] => !!p)
    .flatMap((p) => {
      const { precio } = conPrecio({ p }, ctx);
      const ley = leyes.find((l) => l.id === p.leyId)?.nombre.replace(" (oro bajo)", "");
      const e = {
        codigo: p.codigo,
        barras: p.codigoBarras ?? p.codigo,
        nombre: p.nombre,
        detalle: [ley ?? p.metalDetalle, gramos(p.pesoNetoMg), p.talle ? `T. ${p.talle}` : null].filter(Boolean).join(" · "),
        precio: conPrecioImpreso && precio.vigente != null ? `$ ${numero(precio.vigente / 100, 0)}` : null,
      };
      return Array.from({ length: p.tipo === "unica" ? copias : copias }, () => e);
    });
  const pdf = await pdfEtiquetas(items, formato);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquetas-${formato}.pdf"`, "Cache-Control": "no-store" },
  });
}

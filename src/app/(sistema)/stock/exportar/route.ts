/** Listado de stock en Excel o PDF (con los mismos filtros). Los costos solo salen con el permiso «ver_costos». */
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth/sesion";
import { aExcel } from "@/lib/exportar/excel";
import { aPdf } from "@/lib/exportar/pdf";
import type { Columna } from "@/lib/exportar/tabla";
import { hoyIso, numero } from "@/lib/formato";
import { listarStock } from "@/lib/stock/consultas";
import { ESTADOS, ORIGENES, TIPOS, type EstadoPieza } from "@/lib/stock/tipos";
import { gramos } from "@/lib/stock/vista";
import { leerFiltrosStock } from "../filtros";

export async function GET(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
  const f = leerFiltrosStock(Object.fromEntries(req.nextUrl.searchParams));
  const { filas } = await listarStock({ ...f, pagina: undefined }, undefined, true);
  type F = (typeof filas)[number];
  const plata = (c: number | null) => (c == null ? "" : formato === "xlsx" ? c / 100 : numero(c / 100, 0));
  const columnas: Columna<F>[] = [
    { titulo: "Código", valor: (x) => x.p.codigo, ancho: 11 },
    { titulo: "Nombre", valor: (x) => x.p.nombre, ancho: 26 },
    { titulo: "Categoría", valor: (x) => x.categoria, ancho: 12 },
    { titulo: "Tipo", valor: (x) => TIPOS[x.p.tipo as keyof typeof TIPOS], ancho: 12 },
    { titulo: "Metal / ley", valor: (x) => [x.ley, x.p.metalDetalle].filter(Boolean).join(" · "), ancho: 16 },
    { titulo: "Peso neto", valor: (x) => gramos(x.p.pesoNetoMg), ancho: 9, alinear: "der" },
    { titulo: "Estado", valor: (x) => ESTADOS[x.p.estado as EstadoPieza], ancho: 11 },
    { titulo: "Ubicación", valor: (x) => x.ubicacion, ancho: 12 },
    { titulo: "Cant.", valor: (x) => x.p.cantidad, ancho: 6, alinear: "der" },
    { titulo: "Precio $", valor: (x) => plata(x.precio.vigente), ancho: 12, alinear: "der", formatoExcel: "#,##0" },
  ];
  if (u.permisos.has("ver_costos")) {
    columnas.push({ titulo: "Costo $", valor: (x) => plata(x.costo.enPesos), ancho: 12, alinear: "der", formatoExcel: "#,##0" });
    columnas.push({ titulo: "Origen", valor: (x) => ORIGENES[x.p.origen as keyof typeof ORIGENES], ancho: 12 });
  }
  const listado = { titulo: "Stock de piezas", subtitulo: `${filas.length} piezas · precios a la cotización del ${hoyIso().split("-").reverse().join("/")}`, columnas, filas };
  const cuerpo = formato === "pdf" ? await aPdf(listado) : await aExcel(listado);
  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stock-${hoyIso()}.${formato}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Historial diario de cotizaciones en Excel o PDF (una fila por día, una columna por cotización). */
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { haceDias, serieDiaria, serieGramo } from "@/lib/cotizaciones/historial";
import { CODIGOS, type Codigo } from "@/lib/cotizaciones/tipos";
import { aExcel } from "@/lib/exportar/excel";
import { aPdf } from "@/lib/exportar/pdf";
import { numero, hoyIso } from "@/lib/formato";

const COLUMNAS: Codigo[] = ["USD_OFICIAL", "USD_BLUE", "USD_MEP", "USD_TARJETA", "USD_BCRA", "EUR_OFICIAL", "XAU", "XAG"];

export async function GET(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
  const dias = Math.min(3650, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 30));
  const desde = haceDias(dias);
  const series = await Promise.all(COLUMNAS.map((c) => serieDiaria(c, desde)));
  const gramo18 = await serieGramo(750, desde);
  const ref = (await leerConfig(["cotizaciones.dolar_referencia"]))["cotizaciones.dolar_referencia"];

  const diasTodos = [...new Set([...series.flatMap((s) => s.map((p) => p.dia)), ...gramo18.map((p) => p.dia)])].sort().reverse();
  const mapas = series.map((s) => new Map(s.map((p) => [p.dia, p.valor])));
  const mapa18 = new Map(gramo18.map((p) => [p.dia, p.valor]));
  type Fila = { dia: string; valores: (number | undefined)[]; g18?: number };
  const filas: Fila[] = diasTodos.map((d) => ({ dia: d, valores: mapas.map((m) => m.get(d)), g18: mapa18.get(d) }));
  const n = (v?: number, dec = 2) => (v == null ? "" : formato === "xlsx" ? v : numero(v, dec));

  const listado = {
    titulo: "Historial de cotizaciones",
    subtitulo: `Últimos ${dias} días · valor de venta del cierre de cada día · Oro 18k con ${CODIGOS[ref].nombre.toLowerCase()}`,
    columnas: [
      { titulo: "Fecha", valor: (f: Fila) => `${f.dia.slice(8, 10)}/${f.dia.slice(5, 7)}/${f.dia.slice(0, 4)}`, ancho: 11 },
      ...COLUMNAS.map((c, i) => ({
        titulo: CODIGOS[c].tipo === "metal" ? `${CODIGOS[c].corto} (USD)` : CODIGOS[c].nombre.replace("Dólar ", "USD ").replace("referencia BCRA (A3500)", "BCRA"),
        valor: (f: Fila) => n(f.valores[i]),
        ancho: 11,
        alinear: "der" as const,
        formatoExcel: "#,##0.00",
      })),
      { titulo: "Oro 18k $/g", valor: (f: Fila) => n(f.g18, 0), ancho: 12, alinear: "der" as const, formatoExcel: "#,##0" },
    ],
    filas,
  };
  const cuerpo = formato === "pdf" ? await aPdf(listado) : await aExcel(listado);
  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cotizaciones-${hoyIso()}.${formato}"`,
      "Cache-Control": "no-store",
    },
  });
}

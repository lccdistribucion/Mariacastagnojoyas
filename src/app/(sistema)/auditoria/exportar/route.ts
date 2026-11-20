/** Exporta el registro de auditoría filtrado a Excel o PDF. La exportación también queda registrada. */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { ACCIONES, auditar, ENTIDADES } from "@/lib/auditoria";
import { cambiosLegibles, consultarAuditoria } from "@/lib/auditoria-consulta";
import { actorDe, usuarioActual } from "@/lib/auth/sesion";
import { aExcel } from "@/lib/exportar/excel";
import { aPdf } from "@/lib/exportar/pdf";
import type { Listado } from "@/lib/exportar/tabla";
import { fecha, hoyIso } from "@/lib/formato";
import { leerFiltros } from "../filtros";

export async function GET(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  if (!u.permisos.has("ver_auditoria")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
  const f = leerFiltros(Object.fromEntries(req.nextUrl.searchParams));
  const { filas } = await consultarAuditoria(f, true);

  const partes = [f.desde && `desde ${fecha(new Date(`${f.desde}T12:00:00-03:00`))}`, f.hasta && `hasta ${fecha(new Date(`${f.hasta}T12:00:00-03:00`))}`, f.accion && ACCIONES[f.accion as keyof typeof ACCIONES], f.entidad && ENTIDADES[f.entidad], f.texto && `«${f.texto}»`].filter(Boolean);
  const listado: Listado<(typeof filas)[number]> = {
    titulo: "Registro de auditoría",
    subtitulo: `${filas.length} movimientos${partes.length ? ` · ${partes.join(" · ")}` : ""}`,
    columnas: [
      { titulo: "Fecha y hora", valor: (r) => r.fecha, ancho: 17 },
      { titulo: "Usuario", valor: (r) => r.usuarioNombre, ancho: 16 },
      { titulo: "Acción", valor: (r) => ACCIONES[r.accion as keyof typeof ACCIONES] ?? r.accion, ancho: 14 },
      { titulo: "Sección", valor: (r) => ENTIDADES[r.entidad] ?? r.entidad, ancho: 12 },
      { titulo: "Detalle", valor: (r) => r.descripcion, ancho: 44 },
      {
        titulo: "Cambios (antes → después)",
        valor: (r) =>
          cambiosLegibles(r.antes, r.despues)
            .map((c) => `${c.campo}: ${c.antes ?? "—"} → ${c.despues ?? "—"}`)
            .join("; "),
        ancho: 44,
      },
      { titulo: "IP", valor: (r) => r.ip, ancho: 12 },
    ],
    filas,
  };

  await db.transaction(async (tx) =>
    auditar(tx, await actorDe(u), {
      accion: "exportacion",
      entidad: "auditoria",
      descripcion: `Exportó la auditoría a ${formato === "pdf" ? "PDF" : "Excel"} (${filas.length} movimientos)`,
    }),
  );

  const nombre = `auditoria-${hoyIso()}.${formato}`;
  const cuerpo = formato === "pdf" ? await aPdf(listado) : await aExcel(listado);
  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

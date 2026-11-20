import Link from "next/link";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { Aviso, Etiqueta, Tarjeta } from "@/components/ui";
import { IconoFlecha } from "@/components/iconos";
import { auditoria, db, pedidos, reparaciones, reservas, sesiones, usuarios, ventas } from "@/db";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fechaHora, hoyIso, inicioDelDia, numero, ZONA } from "@/lib/formato";
import { salidasPendientes, stockBajo, valuacion } from "@/lib/stock/consultas";
import { proximosEventos } from "@/lib/clientes/recordatorios";
import { resumenTesoreria } from "@/lib/tesoreria/resumen";

export const metadata = { title: "Inicio" };

const ETAPAS = [
  { n: 1, titulo: "Ingreso, roles y auditoría", estado: "listo" },
  { n: 2, titulo: "Cotizaciones automáticas", estado: "listo" },
  { n: 3, titulo: "Piezas y stock", estado: "listo" },
  { n: 4, titulo: "Clientes, proveedores y compras", estado: "listo" },
  { n: 5, titulo: "Ventas, señas, pedidos y reparaciones", estado: "listo" },
  { n: 6, titulo: "Tesorería", estado: "listo" },
  { n: 7, titulo: "Facturación electrónica", estado: "listo" },
  { n: 8, titulo: "Cumplimiento e informes", estado: "siguiente" },
] as const;

function saludo() {
  const h = Number(new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "numeric", hour12: false }).format(new Date()));
  return h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const u = await requiereUsuario();
  const { aviso } = await searchParams;
  const esAdmin = u.permisos.has("ver_auditoria");
  const hoy = inicioDelDia(hoyIso());

  let resumen: { activos: number; conectados: number; ingresosHoy: number; fallidosHoy: number; ultimos: (typeof auditoria.$inferSelect)[] } | null = null;
  if (esAdmin) {
    const [[a], [c], [i], [f], ultimos] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(usuarios).where(eq(usuarios.activo, true)),
      db.select({ n: sql<number>`count(distinct ${sesiones.usuarioId})` }).from(sesiones).where(and(sql`${sesiones.cerradaEn} is null`, gte(sesiones.ultimaActividad, new Date(Date.now() - 30 * 60000)))),
      db.select({ n: sql<number>`count(*)` }).from(auditoria).where(and(eq(auditoria.accion, "ingreso"), gte(auditoria.fecha, hoy))),
      db.select({ n: sql<number>`count(*)` }).from(auditoria).where(and(inArray(auditoria.accion, ["ingreso_fallido", "bloqueo"]), gte(auditoria.fecha, hoy))),
      db.select().from(auditoria).orderBy(sql`${auditoria.fecha} desc`).limit(6),
    ]);
    resumen = { activos: a.n, conectados: c.n, ingresosHoy: i.n, fallidosHoy: f.n, ultimos };
  }

  const [stock, afuera, bajos] = await Promise.all([u.permisos.has("ver_costos") ? valuacion({}) : valuacion({}).then((v) => ({ ...v, costo: null, precio: null })), salidasPendientes(), stockBajo()]);
  const atrasadas = afuera.filter((x) => x.s.devolucionEsperada.getTime() < Date.now()).length;
  const eventos = (await proximosEventos(7)).slice(0, 6);
  const verTodas = u.permisos.has("ver_ventas_de_todos");
  const teso = u.permisos.has("ver_tesoreria") ? await resumenTesoreria() : null;
  const [[vh], [rl], [rv], [pl]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)`, t: sql<number>`coalesce(sum(${ventas.total} + ${ventas.recargos}), 0)` })
      .from(ventas)
      .where(and(eq(ventas.anulada, false), gte(ventas.fecha, hoy), verTodas ? undefined : eq(ventas.vendedorId, u.id), u.permisos.has("ver_sin_facturar") ? undefined : eq(ventas.tipoComprobante, "factura"))),
    db.select({ n: sql<number>`count(*)` }).from(reparaciones).where(inArray(reparaciones.estado, ["lista", "avisada"])),
    db.select({ n: sql<number>`count(*)` }).from(reservas).where(eq(reservas.estado, "activa")),
    db.select({ n: sql<number>`count(*)` }).from(pedidos).where(eq(pedidos.estado, "listo")),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-champagne">{saludo()}</p>
        <h1 className="titulo-serif mt-1 text-4xl sm:text-5xl">{u.nombre.split(" ")[0]}</h1>
      </div>

      {aviso === "clave" && <Aviso tono="ok">Listo: tu clave nueva quedó guardada.</Aviso>}

      {resumen && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { t: "Usuarios activos", v: resumen.activos, href: "/usuarios" },
            { t: "Conectados ahora", v: resumen.conectados },
            { t: "Ingresos de hoy", v: resumen.ingresosHoy, href: "/auditoria?accion=ingreso" },
            { t: "Intentos fallidos hoy", v: resumen.fallidosHoy, href: "/auditoria?accion=ingreso_fallido", alerta: resumen.fallidosHoy > 0 },
          ].map((k) => {
            const contenido = (
              <Tarjeta className={`h-full p-4 sm:p-5 ${k.href ? "transition-colors hover:border-linea-fuerte" : ""}`}>
                <p className="text-xs text-gris">{k.t}</p>
                <p className={`titulo-serif mt-2 text-4xl ${k.alerta ? "text-error" : ""}`}>{k.v}</p>
              </Tarjeta>
            );
            return k.href ? <Link key={k.t} href={k.href}>{contenido}</Link> : <div key={k.t}>{contenido}</div>;
          })}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Hoy en el local">
        {[
          { t: verTodas ? "Ventas de hoy" : "Tus ventas de hoy", v: `${vh.n} · $ ${numero(vh.t / 100, 0)}`, href: "/ventas" },
          { t: "Reparaciones para retirar", v: String(rl.n), href: "/taller?ver=listas" },
          { t: "Pedidos listos", v: String(pl.n), href: "/taller/pedidos?ver=listos" },
          { t: "Reservas activas", v: String(rv.n), href: "/ventas/reservas" },
        ].map((k) => (
          <Link key={k.t} href={k.href}>
            <Tarjeta className="h-full p-4 transition-colors hover:border-linea-fuerte sm:p-5">
              <p className="text-xs text-gris">{k.t}</p>
              <p className="titulo-serif mt-2 text-3xl tabular-nums">{k.v}</p>
            </Tarjeta>
          </Link>
        ))}
      </section>

      {teso && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Tesorería">
          {[
            { t: "Disponible en cajas y bancos", v: `$ ${numero(teso.disponible / 100, 0)}`, href: "/tesoreria" },
            { t: "Tarjetas a acreditar", v: `$ ${numero(teso.tarjetas / 100, 0)}`, href: "/tesoreria/tarjetas", alerta: teso.tarjetasAtrasadas > 0 },
            { t: "Cheques en cartera", v: `$ ${numero(teso.cheques / 100, 0)}`, href: "/tesoreria/cheques" },
            { t: "Caja del día", v: teso.caja, href: "/caja", alerta: teso.caja === "sin abrir" },
          ].map((k) => (
            <Link key={k.t} href={k.href}>
              <Tarjeta className="h-full p-4 transition-colors hover:border-linea-fuerte sm:p-5">
                <p className="text-xs text-gris">{k.t}</p>
                <p className={`titulo-serif mt-2 text-3xl tabular-nums ${k.alerta ? "text-alerta" : ""}`}>{k.v}</p>
              </Tarjeta>
            </Link>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Stock">
        {[
          { t: "Piezas en stock", v: numero(stock.piezas, 0), href: "/stock" },
          { t: "Fuera del local", v: `${afuera.length}${atrasadas ? ` · ${atrasadas} atrasadas` : ""}`, href: "/stock/salidas", alerta: atrasadas > 0 },
          { t: "Con stock bajo", v: String(bajos.length), href: "/stock?bajo=1", alerta: bajos.length > 0 },
          ...(stock.precio != null ? [{ t: "Valor del stock (precio de hoy)", v: `$ ${numero(stock.precio / 100, 0)}`, href: "/stock" }] : []),
        ].map((k) => (
          <Link key={k.t} href={k.href}>
            <Tarjeta className="h-full p-4 transition-colors hover:border-linea-fuerte sm:p-5">
              <p className="text-xs text-gris">{k.t}</p>
              <p className={`titulo-serif mt-2 text-3xl tabular-nums ${k.alerta ? "text-error" : ""}`}>{k.v}</p>
            </Tarjeta>
          </Link>
        ))}
      </section>

      {eventos.length > 0 && (
        <Tarjeta>
          <div className="flex items-center justify-between border-b border-linea px-5 py-4">
            <h2 className="font-medium">Esta semana</h2>
            <Link href="/clientes/recordatorios" className="flex items-center gap-1 text-sm text-gris hover:text-tinta">Recordatorios <IconoFlecha className="size-4" /></Link>
          </div>
          <ul className="grid divide-y divide-linea sm:grid-cols-2 sm:divide-y-0">
            {eventos.map((e) => (
              <li key={`${e.clienteId}-${e.tipo}`} className="flex items-center gap-3 px-5 py-3">
                <span aria-hidden>{e.tipo === "cumpleanos" ? "🎂" : "💍"}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <Link href={`/clientes/${e.clienteId}`} className="font-medium hover:underline">{e.nombre}</Link>
                  <span className="block text-xs text-gris">{e.tipo === "cumpleanos" ? "Cumpleaños" : "Aniversario"} · {e.dias === 0 ? "hoy" : e.dias === 1 ? "mañana" : `en ${e.dias} días`}</span>
                </span>
                {e.enlace && <a href={e.enlace} target="_blank" rel="noopener" className="text-sm text-gris underline underline-offset-2 hover:text-tinta">Saludar</a>}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {resumen && (
          <Tarjeta>
            <div className="flex items-center justify-between border-b border-linea px-5 py-4">
              <h2 className="font-medium">Últimos movimientos</h2>
              <Link href="/auditoria" className="flex items-center gap-1 text-sm text-gris hover:text-tinta">
                Ver todo <IconoFlecha className="size-4" />
              </Link>
            </div>
            <ul className="divide-y divide-linea">
              {resumen.ultimos.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3">
                  <span className="text-sm">{e.descripcion}</span>
                  <span className="text-xs text-gris">{e.usuarioNombre} · {fechaHora(e.fecha)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Tarjeta className={resumen ? "" : "lg:col-span-2"}>
          <div className="border-b border-linea px-5 py-4">
            <h2 className="font-medium">Cómo avanza el sistema</h2>
            <p className="mt-0.5 text-xs text-gris">Se construye por módulos; cada uno se prueba antes de pasar al siguiente.</p>
          </div>
          <ol className="divide-y divide-linea">
            {ETAPAS.map((e) => (
              <li key={e.n} className="flex items-center gap-4 px-5 py-3">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${"estado" in e && e.estado === "listo" ? "border-tinta bg-tinta text-white" : "border-linea-fuerte text-gris"}`}>{e.n}</span>
                <span className={`flex-1 text-sm ${"estado" in e && e.estado === "listo" ? "" : "text-tinta-suave"}`}>{e.titulo}</span>
                {"estado" in e && e.estado === "listo" && <Etiqueta tono="ok">Listo</Etiqueta>}
                {"estado" in e && e.estado === "siguiente" && <Etiqueta tono="champagne">Sigue</Etiqueta>}
              </li>
            ))}
          </ol>
        </Tarjeta>
      </div>
    </div>
  );
}

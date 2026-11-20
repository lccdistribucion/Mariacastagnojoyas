/**
 * Actualización de cotizaciones. Para cada cotización se usa la PRIMERA fuente (en el orden configurado) que
 * la entregue con un valor razonable. Si la principal falla y responde otra → se usa esa y se avisa.
 * Si ninguna responde → se conserva el último valor guardado, se marca en rojo y se avisa. Nunca se borra nada
 * y nunca se deja al sistema sin precio.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import { actualizacionesCotizacion, cotizaciones, cotizacionesEstado, db } from "@/db";
import { crearAlerta } from "../alertas";
import { leerConfig } from "../config";
import { hoyIso, inicioDelDia, porcentaje } from "../formato";
import { conectoresOrdenados } from "./registro";
import { aMicro, CODIGOS, deMicro, lecturaValida, TODOS_LOS_CODIGOS, type Codigo, type Conector, type Lectura } from "./tipos";

/** Se guarda un registro nuevo si cambió el valor, o si el último tiene más de 3 horas (historial con puntos regulares). */
const REGISTRO_CADA_MS = 3 * 3600_000;

export type ResultadoActualizacion = {
  actualizadas: Codigo[];
  conRespaldo: { codigo: Codigo; fuente: string }[];
  fallidas: Codigo[];
  fuentes: { id: string; nombre: string; ok: boolean; error?: string; ms: number }[];
};

let enCurso: Promise<ResultadoActualizacion> | null = null;

/** Evita dos actualizaciones a la vez (por ejemplo, la automática y un «Actualizar ahora»). */
export function actualizarCotizaciones(origen: "automatica" | "manual", usuarioId: number | null = null, conectores?: Conector[]) {
  enCurso ??= ejecutar(origen, usuarioId, conectores).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function ejecutar(origen: "automatica" | "manual", usuarioId: number | null, conectoresDados?: Conector[]): Promise<ResultadoActualizacion> {
  const inicio = Date.now();
  const cfg = await leerConfig(["cotizaciones.conectores", "cotizaciones.alerta_variacion_pct", "cotizaciones.dolar_referencia"]);
  const conectores = conectoresDados ?? conectoresOrdenados(cfg["cotizaciones.conectores"]);

  // 1) Consultar todas las fuentes en paralelo (cada una con su tiempo límite).
  const respuestas = await Promise.all(
    conectores.map(async (c) => {
      const t = Date.now();
      try {
        const lecturas = (await c.obtener()).filter(lecturaValida);
        if (!lecturas.length) throw new Error("respondió sin datos válidos");
        return { c, lecturas, ok: true as const, ms: Date.now() - t };
      } catch (e) {
        return { c, lecturas: [] as Lectura[], ok: false as const, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t };
      }
    }),
  );

  // 2) Elegir, para cada cotización, la primera fuente que la dio.
  const ahora = new Date();
  const res: ResultadoActualizacion = {
    actualizadas: [],
    conRespaldo: [],
    fallidas: [],
    fuentes: respuestas.map((r) => ({ id: r.c.id, nombre: r.c.nombre, ok: r.ok, ...(r.ok ? {} : { error: r.error }), ms: r.ms })),
  };
  const hoy = hoyIso(ahora);

  for (const codigo of TODOS_LOS_CODIGOS) {
    const candidatos = conectores.filter((c) => c.codigos.includes(codigo));
    if (!candidatos.length) continue;
    const principal = candidatos[0];
    let elegido: { c: Conector; l: Lectura } | null = null;
    for (const c of candidatos) {
      const l = respuestas.find((r) => r.c.id === c.id)?.lecturas.find((x) => x.codigo === codigo);
      if (l) {
        elegido = { c, l };
        break;
      }
    }

    if (!elegido) {
      res.fallidas.push(codigo);
      await db
        .insert(cotizacionesEstado)
        .values({ codigo, ultimoIntento: ahora, error: "Ninguna fuente respondió" })
        .onConflictDoUpdate({ target: cotizacionesEstado.codigo, set: { ultimoIntento: ahora, error: "Ninguna fuente respondió" } });
      await crearAlerta({
        tipo: "cotizacion_sin_fuente",
        nivel: "error",
        titulo: `No se pudo actualizar: ${CODIGOS[codigo].nombre}`,
        detalle: "Ninguna fuente respondió. El sistema sigue usando el último valor guardado (marcado en rojo). Podés cargar uno a mano en Cotizaciones.",
        clave: `sin_fuente:${codigo}:${hoy}`,
      });
      continue;
    }

    const esRespaldo = elegido.c.id !== principal.id;
    const origenFila = esRespaldo ? "respaldo" : "automatica";
    const compra = aMicro(elegido.l.compra);
    const venta = aMicro(elegido.l.venta);
    const [ultima] = await db.select().from(cotizaciones).where(eq(cotizaciones.codigo, codigo)).orderBy(desc(cotizaciones.fecha)).limit(1);
    if (!ultima || ultima.compra !== compra || ultima.venta !== venta || ahora.getTime() - ultima.fecha.getTime() > REGISTRO_CADA_MS) {
      await db.insert(cotizaciones).values({ codigo, compra, venta, fuente: elegido.c.id, origen: origenFila, fecha: ahora, fechaFuente: elegido.l.fechaFuente });
    }
    await db
      .insert(cotizacionesEstado)
      .values({ codigo, ultimoIntento: ahora, ultimoOk: ahora, fuente: elegido.c.id, esRespaldo, error: null })
      .onConflictDoUpdate({ target: cotizacionesEstado.codigo, set: { ultimoIntento: ahora, ultimoOk: ahora, fuente: elegido.c.id, esRespaldo, error: null } });

    res.actualizadas.push(codigo);
    if (esRespaldo) {
      res.conRespaldo.push({ codigo, fuente: elegido.c.nombre });
      const caida = respuestas.find((r) => r.c.id === principal.id);
      await crearAlerta({
        tipo: "cotizacion_respaldo",
        nivel: "alerta",
        titulo: `Fuente principal sin respuesta: ${principal.nombre}`,
        detalle: `Se usó ${elegido.c.nombre} como respaldo (por ejemplo para ${CODIGOS[codigo].nombre}).${caida && !caida.ok ? ` Error: ${caida.error}.` : ""}`,
        clave: `respaldo:${principal.id}:${hoy}`,
      });
    }
  }

  // 3) Variación fuerte del día (dólar de referencia y oro) respecto del último valor de un día anterior.
  for (const codigo of [cfg["cotizaciones.dolar_referencia"], "XAU"] as Codigo[]) {
    if (!res.actualizadas.includes(codigo)) continue;
    const [actual] = await db.select().from(cotizaciones).where(eq(cotizaciones.codigo, codigo)).orderBy(desc(cotizaciones.fecha)).limit(1);
    const [previa] = await db
      .select()
      .from(cotizaciones)
      .where(and(eq(cotizaciones.codigo, codigo), lt(cotizaciones.fecha, inicioDelDia(hoy))))
      .orderBy(desc(cotizaciones.fecha))
      .limit(1);
    if (!actual || !previa) continue;
    const variacion = (deMicro(actual.venta) / deMicro(previa.venta) - 1) * 10000; // centésimos de punto
    if (Math.abs(variacion) >= cfg["cotizaciones.alerta_variacion_pct"]) {
      const sube = variacion > 0;
      await crearAlerta({
        tipo: "cotizacion_variacion",
        nivel: "alerta",
        titulo: `${CODIGOS[codigo].nombre} ${sube ? "subió" : "bajó"} ${porcentaje(Math.round(Math.abs(variacion)))} en el día`,
        detalle: `Pasó de ${deMicro(previa.venta).toLocaleString("es-AR")} a ${deMicro(actual.venta).toLocaleString("es-AR")}. Conviene revisar los precios de las piezas que dependen de esta cotización.`,
        clave: `variacion:${codigo}:${hoy}:${sube ? "sube" : "baja"}`,
      });
    }
  }

  await db.insert(actualizacionesCotizacion).values({
    fecha: ahora,
    origen,
    usuarioId,
    actualizadas: res.actualizadas.length,
    conRespaldo: res.conRespaldo.length,
    fallidas: res.fallidas.length,
    detalle: JSON.stringify(res.fuentes),
    duracionMs: Date.now() - inicio,
  });
  return res;
}

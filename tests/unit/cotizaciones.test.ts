import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { Conector, Lectura } from "../../src/lib/cotizaciones/tipos";
import { basePrueba } from "./preparar";

type M = {
  actualizar: typeof import("../../src/lib/cotizaciones/actualizar");
  vigentes: typeof import("../../src/lib/cotizaciones/vigentes");
  gestion: typeof import("../../src/lib/cotizaciones/gestion");
  calculo: typeof import("../../src/lib/cotizaciones/calculo");
  historial: typeof import("../../src/lib/cotizaciones/historial");
  tareas: typeof import("../../src/lib/tareas");
  alertas: typeof import("../../src/lib/alertas");
  config: typeof import("../../src/lib/config");
  db: typeof import("../../src/db");
};
let m: M;
const SIS = { id: 1, nombre: "Admin" };

/** Fuente falsa: devuelve lo que se le diga o falla. */
function fuente(id: string, codigos: Lectura["codigo"][], valores: Partial<Record<string, number>>, falla = false): Conector {
  return {
    id,
    nombre: id,
    sitio: id,
    codigos,
    gratis: true,
    requiereClave: false,
    limites: "",
    async obtener() {
      if (falla) throw new Error("sin conexión");
      return codigos.filter((c) => valores[c] != null).map((c) => ({ codigo: c, compra: valores[c]! * 0.98, venta: valores[c]!, fechaFuente: new Date() }));
    },
  };
}

before(async () => {
  await basePrueba();
  m = {
    actualizar: await import("../../src/lib/cotizaciones/actualizar"),
    vigentes: await import("../../src/lib/cotizaciones/vigentes"),
    gestion: await import("../../src/lib/cotizaciones/gestion"),
    calculo: await import("../../src/lib/cotizaciones/calculo"),
    historial: await import("../../src/lib/cotizaciones/historial"),
    tareas: await import("../../src/lib/tareas"),
    alertas: await import("../../src/lib/alertas"),
    config: await import("../../src/lib/config"),
    db: await import("../../src/db"),
  };
  for (const l of m.gestion.LEYES_INICIALES) await m.gestion.guardarLey(null, l, SIS);
});

test("cálculo del oro: onza ÷ 31,1035 × pureza × dólar, con ajustes de venta y compra", () => {
  const ley = { metal: "oro", milesimos: 750, ajusteVentaPct: 1000, ajusteCompraPct: -2000, precioManualGramo: null };
  const p = m.calculo.precioGramo(ley, { oro: 3110.35, plata: null }, 1000)!;
  assert.equal(p.usd, 75); // 3110,35 / 31,1035 = 100 USD el gramo de 24k → 18k = 75
  assert.equal(p.mercado, 75000);
  assert.equal(p.venta, 82500); // +10 %
  assert.equal(p.compra, 60000); // −20 % (compra de oro usado)
  assert.equal(m.calculo.milesimosDeQuilates(18), 750);
  assert.equal(m.calculo.milesimosDeQuilates(10), 417);
  const plata = m.calculo.precioGramo({ metal: "plata", milesimos: 925, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null }, { oro: null, plata: 31.1035 }, 1500)!;
  assert.equal(plata.mercado, 1387.5);
  const manual = m.calculo.precioGramo({ metal: "otro", milesimos: 1000, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: 250000 }, { oro: null, plata: null }, null)!;
  assert.equal(manual.mercado, 2500);
  assert.ok(manual.manual);
});

test("frecuencia: en horario comercial cada N minutos, fuera de horario cada M", () => {
  const cfg = { frecuencia: 30, fuera: 180, desde: "09:00", hasta: "20:00", dias: [1, 2, 3, 4, 5, 6] };
  assert.equal(m.tareas.frecuenciaAhora(cfg, { dia: 2, hora: "10:15" }), 30);
  assert.equal(m.tareas.frecuenciaAhora(cfg, { dia: 2, hora: "21:00" }), 180);
  assert.equal(m.tareas.frecuenciaAhora(cfg, { dia: 7, hora: "11:00" }), 180);
});

test("actualización normal: usa la fuente principal y queda en verde", async () => {
  const principal = fuente("A", ["USD_BLUE", "USD_OFICIAL", "EUR_OFICIAL"], { USD_BLUE: 1600, USD_OFICIAL: 1500, EUR_OFICIAL: 1700 });
  const oro = fuente("O", ["XAU", "XAG"], { XAU: 3110.35, XAG: 31.1035 });
  const r = await m.actualizar.actualizarCotizaciones("manual", 1, [principal, oro]);
  assert.deepEqual(r.fallidas, []);
  assert.equal(r.conRespaldo.length, 0);
  const v = await m.vigentes.obtenerVigentes();
  assert.equal(v.USD_BLUE.venta, 1600);
  assert.equal(v.USD_BLUE.estado, "ok");
  assert.equal(v.USD_BLUE.fuente, "A");
});

test("si la principal falla se usa la de respaldo y se avisa al administrador", async () => {
  const principal = fuente("A", ["USD_BLUE"], {}, true);
  const respaldo = fuente("B", ["USD_BLUE"], { USD_BLUE: 1610 });
  const r = await m.actualizar.actualizarCotizaciones("automatica", null, [principal, respaldo]);
  assert.deepEqual(r.conRespaldo, [{ codigo: "USD_BLUE", fuente: "B" }]);
  const v = await m.vigentes.obtenerVigentes();
  assert.equal(v.USD_BLUE.venta, 1610);
  assert.equal(v.USD_BLUE.fuente, "B");
  const avisos = await m.alertas.listarAlertas();
  assert.ok(avisos.some((a) => a.tipo === "cotizacion_respaldo" && /A/.test(a.titulo)));
});

test("si ninguna fuente responde se mantiene el último valor, en rojo, y se avisa (una sola vez por día)", async () => {
  const caida = [fuente("A", ["USD_BLUE"], {}, true), fuente("B", ["USD_BLUE"], {}, true)];
  await m.actualizar.actualizarCotizaciones("automatica", null, caida);
  await m.actualizar.actualizarCotizaciones("automatica", null, caida);
  const v = await m.vigentes.obtenerVigentes();
  assert.equal(v.USD_BLUE.venta, 1610, "sigue el último valor guardado");
  assert.equal(v.USD_BLUE.estado, "fallo");
  const avisos = (await m.alertas.listarAlertas()).filter((a) => a.tipo === "cotizacion_sin_fuente");
  assert.equal(avisos.length, 1);
});

test("un dato absurdo de una fuente se descarta y se usa la siguiente", async () => {
  const rota = fuente("A", ["USD_BLUE"], { USD_BLUE: 0.0001 });
  const buena = fuente("B", ["USD_BLUE"], { USD_BLUE: 1620 });
  await m.actualizar.actualizarCotizaciones("automatica", null, [rota, buena]);
  const v = await m.vigentes.obtenerVigentes();
  assert.equal(v.USD_BLUE.venta, 1620);
  assert.equal(v.USD_BLUE.estado, "ok");
});

test("aviso de variación fuerte del dólar de referencia respecto del día anterior", async () => {
  const { db, cotizaciones } = m.db;
  await db.insert(cotizaciones).values({ codigo: "USD_BLUE", compra: 1_400_000_000, venta: 1_500_000_000, fuente: "B", origen: "automatica", fecha: new Date(Date.now() - 2 * 86400_000) });
  // hoy: 1620 vs 1500 de un día anterior → +8 % (umbral por defecto 3 %)
  await m.actualizar.actualizarCotizaciones("automatica", null, [fuente("B", ["USD_BLUE"], { USD_BLUE: 1620 })]);
  const avisos = (await m.alertas.listarAlertas()).filter((a) => a.tipo === "cotizacion_variacion");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].titulo, /subió 8/);
});

test("cotización propia del negocio: manda sobre la automática hasta que se quita", async () => {
  await m.gestion.cargarManual("USD_BLUE", 1550, 1580, true, "precio del negocio", SIS);
  await m.actualizar.actualizarCotizaciones("automatica", null, [fuente("B", ["USD_BLUE"], { USD_BLUE: 1700 })]);
  let v = await m.vigentes.obtenerVigentes();
  assert.equal(v.USD_BLUE.venta, 1580);
  assert.equal(v.USD_BLUE.estado, "propia");
  await m.gestion.quitarFija("USD_BLUE", SIS);
  v = await m.vigentes.obtenerVigentes();
  assert.equal(v.USD_BLUE.venta, 1700);
});

test("carga manual sin fijar: vale hasta la próxima automática", async () => {
  await m.gestion.cargarManual("EUR_BLUE", 1700, 1750, false, "", SIS);
  const v = await m.vigentes.obtenerVigentes();
  assert.equal(v.EUR_BLUE.venta, 1750);
  assert.equal(v.EUR_BLUE.fuente, "manual");
  await assert.rejects(m.gestion.cargarManual("EUR_BLUE", 0, -1, false, "", SIS), /Revisá/);
});

test("precio por gramo de cada ley con el dólar de referencia (blue por defecto)", async () => {
  const p = await m.vigentes.preciosPorLey();
  const l18 = p.leyes.find((l) => l.nombre === "Oro 18k")!;
  // XAU 3110,35 → 100 USD/g 24k → 18k 75 USD/g × blue 1700 = 127.500
  assert.equal(l18.precio?.mercado, 127500);
  const plata = p.leyes.find((l) => l.nombre === "Plata 925")!;
  assert.equal(plata.precio?.mercado, 1572.5); // 1 USD/g × 0,925 × 1700
});

test("leyes: valida pureza, calcula milésimos desde quilates y no repite nombres", async () => {
  const id = await m.gestion.guardarLey(null, { nombre: "Oro 22k", metal: "oro", quilates: 22, milesimos: null, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true }, SIS);
  const leyes = await m.vigentes.listarLeyes();
  assert.equal(leyes.find((l) => l.id === id)?.milesimos, 917);
  await assert.rejects(m.gestion.guardarLey(null, { nombre: "Oro 22k", metal: "oro", quilates: 22, milesimos: null, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true }, SIS), /Ya existe/);
  await assert.rejects(m.gestion.guardarLey(null, { nombre: "Acero", metal: "otro", quilates: null, milesimos: 1000, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true }, SIS), /a mano/);
  await assert.rejects(m.gestion.guardarLey(null, { nombre: "Raro", metal: "plata", quilates: null, milesimos: 1200, ajusteVentaPct: 0, ajusteCompraPct: 0, precioManualGramo: null, activo: true }, SIS), /1000/);
});

test("la «foto» de cotizaciones para guardar en cada operación trae monedas y gramos", async () => {
  const f = await m.vigentes.fotoCotizaciones();
  assert.equal(f.referencia, "USD_BLUE");
  assert.ok(f.valores.XAU && f.valores.USD_BLUE);
  assert.ok(f.gramos["Oro 18k"].mercado > 0);
});

test("importar historial: agrega solo los días que faltan y no pisa nada", async () => {
  const falso = (async (url: string) => {
    const u = String(url);
    const cuerpo = u.includes("bcra")
      ? { results: [{ fecha: "2026-01-05", detalle: [{ codigoMoneda: "XAU", tipoPase: 2700, tipoCotizacion: 0 }] }, { fecha: "2026-01-06", detalle: [{ codigoMoneda: "XAU", tipoPase: 2710, tipoCotizacion: 0 }] }] }
      : [{ compra: 1100, venta: 1150, fecha: "2026-01-05" }];
    return new Response(JSON.stringify(cuerpo), { status: 200 });
  }) as typeof fetch;
  const r1 = await m.historial.importarHistorial(400, SIS, falso);
  assert.ok(r1.total > 0);
  const r2 = await m.historial.importarHistorial(400, SIS, falso);
  assert.equal(r2.total, 0, "la segunda vez no agrega nada");
  const serie = await m.historial.serieDiaria("XAU", "2026-01-01");
  assert.deepEqual(serie.slice(0, 2), [{ dia: "2026-01-05", valor: 2700 }, { dia: "2026-01-06", valor: 2710 }]);
});

test("carga manual: frena un valor que parece un error de tipeo", async () => {
  await assert.rejects(m.gestion.cargarManual("USD_OFICIAL", 1.56, 1.59, false, "", SIS), /30 %/);
});

test("copia diaria: guarda la copia y conserva solo las últimas N diarias", async () => {
  const { copiaDiaria, CARPETA_BACKUPS } = await import("../../src/lib/backup");
  const { readdirSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const extra = mkdtempSync(`${tmpdir()}/mc-extra-`);
  assert.ok(CARPETA_BACKUPS.includes("mc-prueba-"), "las pruebas nunca usan la carpeta de copias real");
  for (let i = 0; i < 3; i++) {
    await copiaDiaria(7, extra);
    await new Promise((r) => setTimeout(r, 1100)); // nombres distintos (llevan la hora)
  }
  assert.ok(readdirSync(extra).some((f) => f.endsWith("-diaria.db")), "copia también en la carpeta adicional");
  const diarias = readdirSync(CARPETA_BACKUPS).filter((f) => f.endsWith("-diaria.db"));
  assert.ok(diarias.length >= 3 && diarias.length <= 7);
});

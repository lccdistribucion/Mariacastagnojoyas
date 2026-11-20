import assert from "node:assert/strict";
import { before, test } from "node:test";
import { basePrueba } from "./preparar";

let m: {
  db: typeof import("../../src/db");
  prod: typeof import("../../src/lib/stock/productos");
  mov: typeof import("../../src/lib/stock/movimientos");
  cons: typeof import("../../src/lib/stock/consultas");
  precios: typeof import("../../src/lib/stock/precios");
  inv: typeof import("../../src/lib/stock/inventario");
  imp: typeof import("../../src/lib/stock/importar");
  mas: typeof import("../../src/lib/stock/masivo");
  eti: typeof import("../../src/lib/stock/etiquetas");
  demo: typeof import("../../src/lib/stock/demo");
  config: typeof import("../../src/lib/config");
  gestion: typeof import("../../src/lib/cotizaciones/gestion");
  audit: typeof import("../../src/lib/auditoria-consulta");
};
const A = { id: 1, nombre: "Admin" };
let ids: { cat: number; ley18: number; ubi: number; ubi2: number };

const base = () => ({
  codigo: "",
  codigoBarras: null,
  nombre: "Anillo de prueba",
  tipo: "unica" as const,
  categoriaId: ids.cat,
  coleccion: null,
  artesano: null,
  leyId: ids.ley18,
  metalDetalle: null,
  pesoBrutoMg: 3000,
  pesoNetoMg: 2500,
  medidas: null,
  talle: "14",
  descripcion: null,
  notasInternas: null,
  costoMetal: 10000_00,
  costoManoObra: 0,
  costoPiedras: 0,
  costoOtros: 0,
  monedaCosto: "ARS" as const,
  modoPrecio: "fijo" as const,
  precioLista: 100000_00,
  precioOferta: null,
  monedaPrecio: "ARS" as const,
  hechura: 0,
  ivaPct: 2100,
  origen: "compra" as const,
  consignante: null,
  ubicacionId: ids.ubi,
  cantidad: 1,
  stockMinimo: 0,
  piedras: [],
});

before(async () => {
  await basePrueba();
  m = {
    db: await import("../../src/db"),
    prod: await import("../../src/lib/stock/productos"),
    mov: await import("../../src/lib/stock/movimientos"),
    cons: await import("../../src/lib/stock/consultas"),
    precios: await import("../../src/lib/stock/precios"),
    inv: await import("../../src/lib/stock/inventario"),
    imp: await import("../../src/lib/stock/importar"),
    mas: await import("../../src/lib/stock/masivo"),
    eti: await import("../../src/lib/stock/etiquetas"),
    demo: await import("../../src/lib/stock/demo"),
    config: await import("../../src/lib/config"),
    gestion: await import("../../src/lib/cotizaciones/gestion"),
    audit: await import("../../src/lib/auditoria-consulta"),
  };
  const { db, categorias, ubicaciones } = m.db;
  for (const l of m.gestion.LEYES_INICIALES) await m.gestion.guardarLey(null, l, A);
  const [c] = await db.insert(categorias).values({ nombre: "Anillos", prefijo: "ANI" }).returning();
  const [u] = await db.insert(ubicaciones).values({ nombre: "Vitrina" }).returning();
  const [u2] = await db.insert(ubicaciones).values({ nombre: "Caja fuerte" }).returning();
  const leyes = await db.select().from(m.db.leyesMetal);
  ids = { cat: c.id, ley18: leyes.find((l) => l.nombre === "Oro 18k")!.id, ubi: u.id, ubi2: u2.id };
  // cotizaciones conocidas: blue 1000, onza 3110,35 → 18k = 75 USD/g = $ 75.000/g
  await m.gestion.cargarManual("USD_BLUE", 990, 1000, true, "", A);
  await m.gestion.cargarManual("XAU", 3110.35, 3110.35, true, "", A);
  await m.gestion.cargarManual("EUR_OFICIAL", 1100, 1100, true, "", A);
});

test("precio por gramo: peso neto × gramo de venta + hechura; precio en dólares a la cotización", () => {
  const cot = { USD: 1000, EUR: 1100 };
  const p = m.precios.precioPieza({ ...base(), modoPrecio: "gramo", pesoNetoMg: 2500, hechura: 50000_00 }, 75000, cot);
  assert.equal(p.lista, (2.5 * 75000 + 50000) * 100);
  const usd = m.precios.precioPieza({ ...base(), precioLista: 380_00, monedaPrecio: "USD" }, null, cot);
  assert.equal(usd.lista, 380000_00);
  assert.equal(m.precios.costoPieza({ ...base(), costoMetal: 200_00, costoManoObra: 50_00, monedaCosto: "USD" }, cot).enPesos, 250000_00);
  assert.equal(m.precios.precioConLista(100000_00, -1000), 90000_00);
  assert.equal(m.precios.redondear(123456_78, 1000), 124000_00);
});

test("alta: código automático por categoría, código de barras igual al código, movimiento y auditoría", async () => {
  const r1 = await m.prod.crearProducto(base(), A);
  const r2 = await m.prod.crearProducto({ ...base(), nombre: "Otro anillo" }, A);
  assert.equal(r1.codigo, "ANI-0001");
  assert.equal(r2.codigo, "ANI-0002");
  const p = await m.prod.obtenerProducto(r1.id);
  assert.equal(p?.codigoBarras, "ANI-0001");
  assert.equal(p?.movimientos[0].tipo, "alta");
  const { filas } = await m.audit.consultarAuditoria({ entidad: "producto" });
  assert.ok(filas.some((f) => /ANI-0001/.test(f.descripcion)));
});

test("validaciones: código repetido, neto mayor que bruto, por gramo sin ley, consignación sin consignante", async () => {
  await assert.rejects(m.prod.crearProducto({ ...base(), codigo: "ani-0001" }, A), /Ya existe/);
  await assert.rejects(m.prod.crearProducto({ ...base(), pesoNetoMg: 5000 }, A), /neto/);
  await assert.rejects(m.prod.crearProducto({ ...base(), modoPrecio: "gramo", leyId: null }, A), /ley/);
  await assert.rejects(m.prod.crearProducto({ ...base(), origen: "consignacion" }, A), /consignación/);
});

test("una pieza única siempre es 1 unidad", async () => {
  const r = await m.prod.crearProducto({ ...base(), cantidad: 5 }, A);
  assert.equal((await m.prod.obtenerProducto(r.id))?.cantidad, 1);
});

test("editar: guarda solo lo que cambió y el historial de precio", async () => {
  const r = await m.prod.crearProducto({ ...base(), nombre: "Para editar" }, A);
  await m.prod.editarProducto(r.id, { ...base(), codigo: r.codigo, nombre: "Para editar", precioLista: 120000_00 }, A);
  const p = (await m.prod.obtenerProducto(r.id))!;
  assert.equal(p.precioLista, 120000_00);
  assert.equal(p.precios[0].listaAntes, 100000_00);
  const { filas } = await m.audit.consultarAuditoria({ entidad: "producto", accion: "modificacion" });
  assert.deepEqual(JSON.parse(filas[0].antes!), { "Precio de lista": "100.000,00" });
});

test("ajuste de pieza única por pérdida: queda dada de baja; motivo obligatorio", async () => {
  const r = await m.prod.crearProducto({ ...base(), nombre: "Se pierde" }, A);
  await assert.rejects(m.mov.ajustarStock(r.id, { delta: -1, motivo: "perdida", detalle: "" }, A, 1), /motivo/);
  await m.mov.ajustarStock(r.id, { delta: -1, motivo: "perdida", detalle: "No aparece en la vitrina" }, A, 1);
  const p = (await m.prod.obtenerProducto(r.id))!;
  assert.equal(p.estado, "baja");
  assert.equal(p.cantidad, 0);
  assert.equal(p.movimientos[0].autorizadoPor, 1);
  // y si aparece: sobrante
  await m.mov.ajustarStock(r.id, { delta: 1, motivo: "sobrante", detalle: "Apareció en el taller" }, A, 1);
  assert.equal((await m.prod.obtenerProducto(r.id))!.estado, "disponible");
});

test("artículos por cantidad: no deja stock negativo salvo que se permita", async () => {
  const r = await m.prod.crearProducto({ ...base(), nombre: "Cadena", tipo: "cantidad", cantidad: 3, stockMinimo: 5 }, A);
  await assert.rejects(m.mov.ajustarStock(r.id, { delta: -4, motivo: "faltante", detalle: "conteo" }, A, 1), /negativo/);
  await m.config.guardarConfig({ "stock.permitir_negativo": true }, A);
  await m.mov.ajustarStock(r.id, { delta: -4, motivo: "faltante", detalle: "conteo" }, A, 1);
  assert.equal((await m.prod.obtenerProducto(r.id))!.cantidad, -1);
  await m.config.guardarConfig({ "stock.permitir_negativo": false }, A);
  const bajos = await m.cons.stockBajo();
  assert.ok(bajos.some((b) => b.id === r.id));
});

test("salida del local (prueba de cliente) y devolución; no sale una pieza que no está disponible", async () => {
  const r = await m.prod.crearProducto({ ...base(), nombre: "Para probar" }, A);
  const s = await m.mov.registrarSalida(r.id, { destino: "prueba_cliente", detalle: "Clienta Gómez", responsable: "Lucía", devolucionEsperada: new Date(Date.now() + 2 * 86400_000) }, A);
  assert.equal((await m.prod.obtenerProducto(r.id))!.estado, "afuera");
  await assert.rejects(m.mov.registrarSalida(r.id, { destino: "feria", detalle: "Feria", responsable: "", devolucionEsperada: new Date(Date.now() + 86400_000) }, A), /disponible/);
  assert.ok((await m.cons.salidasPendientes()).some((x) => x.s.id === s));
  await m.mov.registrarDevolucion(s, A);
  assert.equal((await m.prod.obtenerProducto(r.id))!.estado, "disponible");
});

test("cambio de estado manual y de ubicación quedan en el historial de la pieza", async () => {
  const r = await m.prod.crearProducto({ ...base(), nombre: "Va al taller" }, A);
  await m.mov.cambiarEstado(r.id, "taller", "Ajuste de talle", A);
  await m.mov.cambiarUbicacion(r.id, ids.ubi2, A);
  await assert.rejects(m.mov.cambiarEstado(r.id, "vendido" as never, "", A), /a mano/);
  const p = (await m.prod.obtenerProducto(r.id))!;
  assert.deepEqual(p.movimientos.slice(0, 2).map((x) => x.tipo), ["ubicacion", "estado"]);
  await m.mov.cambiarEstado(r.id, "disponible", "", A);
});

test("valuación a costo y a precio; lo consignado no suma como propio", async () => {
  await m.prod.crearProducto({ ...base(), nombre: "Consignada", origen: "consignacion", consignante: "Artesana X" }, A);
  const v = await m.cons.valuacion({});
  assert.ok(v.precio > 0 && v.costo > 0);
  assert.equal(v.consignacion, 1);
});

test("inventario físico: faltantes, sobrantes y código inexistente", async () => {
  const id = await m.inv.abrirInventario("Vitrina prueba", ids.ubi, A);
  await m.inv.registrarLectura(id, "ANI-0001", A);
  const rep = await m.inv.registrarLectura(id, "ani-0001", A);
  assert.ok(rep.repetida, "avisa que esa pieza ya se leyó");
  await m.inv.registrarLectura(id, "NO-EXISTE", A);
  const r = await m.inv.compararInventario(id);
  assert.ok(r.faltantes.some((f) => f.codigo === "ANI-0002"));
  assert.ok(r.sobrantes.some((s) => s.codigo === "NO-EXISTE"));
  await m.inv.cerrarInventario(id, A);
  await assert.rejects(m.inv.registrarLectura(id, "ANI-0002", A), /cerrada/);
});

test("importar CSV: valida fila por fila, ignora ejemplos y carga las válidas juntas", async () => {
  const csv = [
    "Nombre;Tipo;Categoría;Ley;Peso neto (g);Precio (fijo / gramo);Precio de lista;Cantidad;Código (vacío = automático)",
    "Anillo importado;pieza única;Anillos;Oro 18k;2,5;fijo;150000;1;",
    "Cadena importada;por cantidad;Anillos;Plata 925;4;gramo;;10;",
    "Mal;pieza única;NoExiste;Oro 18k;1;fijo;100;1;",
    "Sin precio;pieza única;Anillos;;;fijo;;1;",
    "Ejemplo (ejemplo);pieza única;Anillos;;;fijo;10;1;",
  ].join("\n");
  const filas = await m.imp.validarFilas(await m.imp.leerArchivo("piezas.csv", Buffer.from(csv)));
  assert.equal(filas.length, 4, "la fila de ejemplo se ignora");
  assert.equal(filas.filter((f) => f.datos).length, 2);
  assert.match(filas[2].errores.join(), /categoría «NoExiste» no existe/);
  assert.match(filas[3].errores.join(), /precio/);
  assert.equal(await m.imp.importar(filas, A, "piezas.csv"), 2);
});

test("la plantilla de Excel se puede volver a leer", async () => {
  const xlsx = await m.imp.plantilla();
  const filas = await m.imp.leerArchivo("plantilla.xlsx", xlsx);
  assert.equal(filas.length, 0, "las filas de ejemplo de la plantilla no se importan");
});

test("actualización masiva: vista previa con redondeo y aplicación con historial", async () => {
  const previa = await m.mas.vistaPrevia({ categoriaId: ids.cat }, { porcentaje: 10, redondeo: 1000, incluirOferta: true, motivo: "suba" });
  const x = previa.find((p) => p.listaAntes === 100000_00)!;
  assert.equal(x.listaDespues, 110000_00);
  const n = await m.mas.aplicarMasivo({ categoriaId: ids.cat }, { porcentaje: 10, redondeo: 1000, incluirOferta: true, motivo: "suba del oro" }, [x.id], A);
  assert.equal(n, 1);
  const p = (await m.prod.obtenerProducto(x.id))!;
  assert.equal(p.precioLista, 110000_00);
  assert.match(p.precios[0].motivo, /masiva \+10 %/);
});

test("etiquetas en PDF en los tres formatos", async () => {
  const e = { codigo: "ANI-0001", barras: "ANI-0001", nombre: "Anillo de prueba", detalle: "Oro 18k · 2,5 g", precio: "$ 100.000" };
  for (const f of ["colita", "adhesiva", "a4"] as const) {
    const pdf = await m.eti.pdfEtiquetas([e, e], f);
    assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
  }
});

test("piezas de ejemplo: se cargan una vez y se quitan sin tocar las reales", async () => {
  const antes = (await m.db.db.select().from(m.db.productos)).length;
  // la categoría de los ejemplos debe existir para el prefijo; si no, quedan sin categoría
  const n = await m.demo.cargarDemo();
  assert.ok(n > 0);
  assert.equal(await m.demo.cargarDemo(), 0, "no se cargan dos veces");
  assert.equal(await m.demo.quitarDemo(A), n);
  assert.equal((await m.db.db.select().from(m.db.productos)).length, antes);
});

test("piezas sin movimiento: compara contra el último movimiento de CADA pieza", async () => {
  const { db, movimientosStock } = m.db;
  const vieja = await m.prod.crearProducto({ ...base(), nombre: "Quieta hace un año" }, A);
  const nueva = await m.prod.crearProducto({ ...base(), nombre: "Recién llegada" }, A);
  const { eq } = await import("drizzle-orm");
  await db.update(movimientosStock).set({ fecha: new Date(Date.now() - 400 * 86400_000) }).where(eq(movimientosStock.productoId, vieja.id));
  const quietas = await m.cons.sinMovimiento(6);
  assert.ok(quietas.some((q) => q.id === vieja.id));
  assert.ok(!quietas.some((q) => q.id === nueva.id));
});

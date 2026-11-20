import assert from "node:assert/strict";
import { before, test } from "node:test";
import { basePrueba } from "./preparar";

let m: {
  db: typeof import("../../src/db");
  id: typeof import("../../src/lib/identidad");
  cli: typeof import("../../src/lib/clientes/clientes");
  rec: typeof import("../../src/lib/clientes/recordatorios");
  prov: typeof import("../../src/lib/proveedores/proveedores");
  comp: typeof import("../../src/lib/proveedores/compras");
  cons: typeof import("../../src/lib/proveedores/consignaciones");
  rep: typeof import("../../src/lib/proveedores/reposicion");
  metal: typeof import("../../src/lib/stock/metal");
  prod: typeof import("../../src/lib/stock/productos");
  gestion: typeof import("../../src/lib/cotizaciones/gestion");
  demo: typeof import("../../src/lib/stock/demo");
};
const A = { id: 1, nombre: "Admin" };
const CUIT_OK = "20-12345678-6"; // dígito verificador válido (calculado)
let ley18 = 0;
let provId = 0;

const cliente = (x: Partial<Parameters<typeof m.cli.crearCliente>[0]> = {}) => ({ nombre: "Ana Pérez", tipoDoc: null, documento: null, condicionIva: "consumidor_final" as const, ...x });
const proveedor = (x: Partial<Parameters<typeof m.prov.crearProveedor>[0]> = {}) => ({ razonSocial: "Proveedor SA", condicionIva: "responsable_inscripto" as const, rubros: ["mayorista" as const], diasPago: 30, ...x });
const piezaNueva = (nombre: string, tipo: "unica" | "cantidad" = "unica") => ({
  codigo: "", codigoBarras: null, nombre, tipo, categoriaId: null, leyId: ley18, metalDetalle: null, pesoBrutoMg: 2000, pesoNetoMg: 2000, medidas: null, talle: null, descripcion: null, notasInternas: null,
  modoPrecio: "fijo", precioLista: 100000_00, precioOferta: null, monedaPrecio: "ARS", hechura: 0, ivaPct: 2100, consignante: null, ubicacionId: null, stockMinimo: tipo === "cantidad" ? 5 : 0, piedras: [],
  coleccion: null, artesano: null,
});

before(async () => {
  await basePrueba();
  m = {
    db: await import("../../src/db"),
    id: await import("../../src/lib/identidad"),
    cli: await import("../../src/lib/clientes/clientes"),
    rec: await import("../../src/lib/clientes/recordatorios"),
    prov: await import("../../src/lib/proveedores/proveedores"),
    comp: await import("../../src/lib/proveedores/compras"),
    cons: await import("../../src/lib/proveedores/consignaciones"),
    rep: await import("../../src/lib/proveedores/reposicion"),
    metal: await import("../../src/lib/stock/metal"),
    prod: await import("../../src/lib/stock/productos"),
    gestion: await import("../../src/lib/cotizaciones/gestion"),
    demo: await import("../../src/lib/stock/demo"),
  };
  for (const l of m.gestion.LEYES_INICIALES) await m.gestion.guardarLey(null, l, A);
  ley18 = (await m.db.db.select().from(m.db.leyesMetal)).find((l) => l.nombre === "Oro 18k")!.id;
  await m.gestion.cargarManual("USD_BLUE", 990, 1000, true, "", A);
  await m.gestion.cargarManual("XAU", 3110.35, 3110.35, true, "", A);
});

test("CUIT: dígito verificador; DNI; WhatsApp argentino", () => {
  assert.ok(m.id.cuitValido(CUIT_OK));
  assert.ok(!m.id.cuitValido("20-12345678-5"));
  assert.ok(!m.id.cuitValido("12345"));
  assert.ok(m.id.dniValido("30.123.456"));
  assert.equal(m.id.normalizarWhatsapp("341 15 555-1234"), "5493415551234");
  assert.equal(m.id.normalizarWhatsapp("0341-155551234"), "5493415551234");
  assert.equal(m.id.normalizarWhatsapp("+54 9 341 555 1234"), "5493415551234");
  assert.equal(m.id.normalizarWhatsapp("11 15 4567 8901"), "5491145678901");
  assert.equal(m.id.normalizarWhatsapp("123"), null);
  assert.match(m.id.enlaceWhatsapp("5493415551234", "Hola Ana"), /^https:\/\/wa\.me\/5493415551234\?text=Hola%20Ana$/);
});

test("clientes: valida documento, no repite DNI y avisa parecidos", async () => {
  await assert.rejects(m.cli.crearCliente(cliente({ tipoDoc: "CUIT", documento: "20-12345678-5" }), A), /CUIT/);
  await assert.rejects(m.cli.crearCliente(cliente({ condicionIva: "responsable_inscripto" }), A), /CUIT/);
  await assert.rejects(m.cli.crearCliente(cliente({ whatsapp: "123" }), A), /WhatsApp/);
  const id = await m.cli.crearCliente(cliente({ tipoDoc: "DNI", documento: "30.123.456", whatsapp: "341 155 551234" }), A);
  await assert.rejects(m.cli.crearCliente(cliente({ nombre: "Otra", tipoDoc: "DNI", documento: "30123456" }), A), /Ya existe un cliente con ese documento/);
  await assert.rejects(m.cli.crearCliente(cliente({ nombre: "ana pérez" }), A), (e: unknown) => e instanceof m.cli.ErrorDuplicado);
  await m.cli.crearCliente(cliente({ nombre: "ana pérez" }), A, { aunqueParezcaDuplicado: true });
  const c = await m.cli.obtenerCliente(id);
  assert.equal(c?.documento, "30123456");
  assert.equal(c?.whatsapp, "5493415551234");
});

test("cuenta corriente de clientes: saldo inicial, vencido y anulación", async () => {
  const id = await m.cli.crearCliente(cliente({ nombre: "Debe Plata" }), A);
  await m.cli.movimientoCcManual(id, { tipo: "saldo_inicial", importe: 50000_00, descripcion: "Deuda del cuaderno", vencimiento: new Date(Date.now() - 86400_000) }, A);
  await m.cli.movimientoCcManual(id, { tipo: "ajuste", importe: -10000_00, descripcion: "Pago anterior", vencimiento: null }, A);
  let c = (await m.cli.obtenerCliente(id))!;
  assert.equal(c.saldo, 40000_00);
  assert.equal(c.vencido, 40000_00);
  const pend = await m.rec.saldosPendientes();
  const p = pend.find((x) => x.clienteId === id)!;
  assert.equal(p.saldo, 40000_00);
  await m.cli.anularMovimientoCc(c.cc.find((x) => x.tipo === "ajuste")!.id, A);
  c = (await m.cli.obtenerCliente(id))!;
  assert.equal(c.saldo, 50000_00);
});

test("recordatorios: días hasta el cumpleaños (incluye cambio de año y 29/02) y mensaje de WhatsApp", async () => {
  assert.equal(m.rec.diasHasta("1990-11-20", "2026-11-18"), 2);
  assert.equal(m.rec.diasHasta("1990-01-02", "2026-12-30"), 3);
  assert.equal(m.rec.diasHasta("1992-02-29", "2027-02-27"), 1, "en año no bisiesto se festeja el 28/02");
  assert.equal(m.rec.completar("Hola {nombre}, saldo {saldo}", { nombre: "Ana", saldo: "$ 10" }), "Hola Ana, saldo $ 10");
  const hoy = new Date();
  const en3 = new Date(hoy.getTime() + 3 * 86400_000);
  const f = `1990-${String(en3.getMonth() + 1).padStart(2, "0")}-${String(en3.getDate()).padStart(2, "0")}`;
  await m.cli.crearCliente(cliente({ nombre: "Cumple Pronto", cumpleanos: f, whatsapp: "341 155 999888" }), A);
  const ev = (await m.rec.proximosEventos(30)).find((e) => e.nombre === "Cumple Pronto")!;
  assert.ok(ev.dias >= 2 && ev.dias <= 4);
  assert.match(ev.enlace!, /wa\.me\/5493415999888\?text=.*Cumple/);
});

test("proveedores: CUIT válido y único, rubros obligatorios", async () => {
  await assert.rejects(m.prov.crearProveedor(proveedor({ rubros: [] }), A), /rubro/);
  await assert.rejects(m.prov.crearProveedor(proveedor({ cuit: "20-12345678-5" }), A), /CUIT/);
  provId = await m.prov.crearProveedor(proveedor({ cuit: CUIT_OK }), A);
  await assert.rejects(m.prov.crearProveedor(proveedor({ razonSocial: "Otro", cuit: CUIT_OK }), A), /CUIT/);
});

test("compra en cuenta corriente: alta de piezas, suma a artículo existente, metal y deuda", async () => {
  const art = await m.prod.crearProducto({ ...piezaNueva("Cadena por cantidad", "cantidad"), origen: "compra", cantidad: 2, costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: 1000_00, monedaCosto: "ARS" } as never, A);
  const id = await m.comp.registrarCompra(
    {
      proveedorId: provId,
      fecha: new Date(),
      tipoComprobante: "A",
      puntoVenta: 3,
      numero: 1234,
      moneda: "USD",
      tipoCambio: 1000,
      condicion: "cuenta_corriente",
      vencimiento: null,
      percepcionIva: 0,
      percepcionIibb: 0,
      otrosImpuestos: 0,
      items: [
        { tipo: "pieza", productoId: null, nueva: piezaNueva("Anillo comprado"), cantidad: 1, costoUnitario: 200_00, ivaPct: 2100 },
        { tipo: "pieza", productoId: art.id, nueva: null, cantidad: 10, costoUnitario: 2_00, ivaPct: 2100 },
        { tipo: "metal", leyId: ley18, pesoMg: 10_000, costoUnitario: 70_00, ivaPct: 0, descripcion: "Oro 18k en grano" },
      ],
    },
    A,
  );
  const c = (await m.comp.obtenerCompra(id))!;
  // neto: 200 + 10×2 + 10 g × 70 = 920 USD; IVA (A): 200×21% + 20×21% = 46,20 → total 966,20
  assert.equal(c.neto, 920_00);
  assert.equal(c.iva, 46_20);
  assert.equal(c.total, 966_20);
  assert.equal(c.pendiente, 966_20);
  const nueva = c.items.find((x) => x.productoNuevo)!;
  const p = (await m.prod.obtenerProducto(nueva.productoId!))!;
  assert.equal(p.proveedorId, provId);
  assert.equal(p.origen, "compra");
  assert.equal(p.costoOtros, 200_00);
  assert.equal(p.monedaCosto, "USD");
  assert.equal((await m.prod.obtenerProducto(art.id))!.cantidad, 12);
  const metal = await m.metal.saldoMetal();
  assert.equal(metal.find((x) => x.leyId === ley18)?.gramos, 10);
  const s = await m.prov.saldos([provId]);
  assert.equal(s.get(provId)?.USD, 966_20);
  const vence = c.vencimiento!.getTime() - c.fecha.getTime();
  assert.ok(Math.abs(vence - 30 * 86400_000) < 1000, "vence a los días de pago del proveedor");
  await assert.rejects(
    m.comp.registrarCompra({ proveedorId: provId, fecha: new Date(), tipoComprobante: "A", puntoVenta: 3, numero: 1234, moneda: "USD", tipoCambio: 1000, condicion: "cuenta_corriente", vencimiento: null, percepcionIva: 0, percepcionIibb: 0, otrosImpuestos: 0, items: [{ tipo: "metal", leyId: ley18, pesoMg: 1000, costoUnitario: 1, ivaPct: 0 }] }, A),
    /ya está cargado/,
  );
});

test("pago parcial imputado a la factura; no se puede imputar de más ni en otra moneda", async () => {
  const [c] = await m.comp.pendientes(provId);
  await assert.rejects(m.comp.registrarPago(provId, { fecha: new Date(), moneda: "ARS", importe: 100_00, medio: "transferencia", tipoCambio: 1, imputaciones: [{ compraId: c.id, importe: 100_00 }], sentido: "pago" }, A), /misma moneda/);
  await assert.rejects(m.comp.registrarPago(provId, { fecha: new Date(), moneda: "USD", importe: 2000_00, medio: "transferencia", tipoCambio: 1000, imputaciones: [{ compraId: c.id, importe: 2000_00 }], sentido: "pago" }, A), /supera/);
  const pago = await m.comp.registrarPago(provId, { fecha: new Date(), moneda: "USD", importe: 500_00, medio: "transferencia", tipoCambio: 1000, imputaciones: [{ compraId: c.id, importe: 500_00 }], sentido: "pago" }, A);
  assert.equal((await m.comp.obtenerCompra(c.id))!.pendiente, 466_20);
  assert.equal((await m.prov.saldos([provId])).get(provId)?.USD, 466_20);
  await assert.rejects(m.comp.anularCompra(c.id, "error de carga", A), /pagos imputados/);
  await m.comp.anularPago(pago, "pago mal cargado", A);
  assert.equal((await m.comp.obtenerCompra(c.id))!.pendiente, 966_20);
});

test("anular compra revierte stock, metal y deuda", async () => {
  const [c] = await m.comp.pendientes(provId);
  await m.comp.anularCompra(c.id, "factura duplicada", A);
  const x = (await m.comp.obtenerCompra(c.id))!;
  assert.ok(x.anulada);
  const nueva = x.items.find((i) => i.productoNuevo)!;
  assert.equal((await m.prod.obtenerProducto(nueva.productoId!))!.estado, "baja");
  assert.equal((await m.metal.saldoMetal()).find((y) => y.leyId === ley18)?.gramos ?? 0, 0);
  assert.equal((await m.prov.saldos([provId])).get(provId)?.USD ?? 0, 0);
});

test("compra de contado: queda pagada en el acto", async () => {
  const id = await m.comp.registrarCompra(
    { proveedorId: provId, fecha: new Date(), tipoComprobante: "X", puntoVenta: null, numero: null, moneda: "ARS", tipoCambio: 1, condicion: "contado", medioPago: "efectivo", vencimiento: null, percepcionIva: 0, percepcionIibb: 0, otrosImpuestos: 0, items: [{ tipo: "pieza", productoId: null, nueva: piezaNueva("Aros contado"), cantidad: 1, costoUnitario: 30000_00, ivaPct: 2100 }] },
    A,
  );
  const c = (await m.comp.obtenerCompra(id))!;
  assert.equal(c.iva, 0, "comprobante X no discrimina IVA");
  assert.equal(c.pendiente, 0);
  assert.equal((await m.prov.saldos([provId])).get(provId)?.ARS ?? 0, 0);
  await m.comp.anularCompra(id, "prueba", A);
});

test("consignación recibida: devolver al dueño; deuda al venderse", async () => {
  const consignante = await m.prov.crearProveedor(proveedor({ razonSocial: "Artesana Consignante", rubros: ["artesano"] }), A);
  const p = await m.prod.crearProducto({ ...piezaNueva("Collar consignado"), origen: "consignacion", proveedorId: consignante, cantidad: 1, costoMetal: 0, costoManoObra: 50000_00, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS" } as never, A);
  const p2 = await m.prod.crearProducto({ ...piezaNueva("Aros consignados"), origen: "consignacion", proveedorId: consignante, cantidad: 1, costoMetal: 0, costoManoObra: 20000_00, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS" } as never, A);
  assert.equal((await m.cons.consignacionRecibida(consignante)).length, 2);
  await m.cons.devolverAlConsignante([p2.id], A);
  assert.equal((await m.prod.obtenerProducto(p2.id))!.estado, "devuelto");
  // simulación de la venta (módulo 5): genera la deuda por el costo
  await m.db.db.transaction((tx) => m.cons.deudaPorConsignacionVendida(tx, p.id, "venta de prueba", A));
  assert.equal((await m.prov.saldos([consignante])).get(consignante)?.ARS, 50000_00);
});

test("consignación entregada a una revendedora: vendida (nos debe) y devuelta", async () => {
  const rev = await m.prov.crearProveedor(proveedor({ razonSocial: "Revendedora", rubros: ["revendedor"] }), A);
  const a = await m.prod.crearProducto({ ...piezaNueva("Pieza para revender 1"), origen: "compra", cantidad: 1, costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS" } as never, A);
  const b = await m.prod.crearProducto({ ...piezaNueva("Pieza para revender 2"), origen: "compra", cantidad: 1, costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS" } as never, A);
  await m.cons.entregarEnConsignacion(rev, [{ productoId: a.id, precioAcordado: 80000_00 }, { productoId: b.id, precioAcordado: 60000_00 }], "", A);
  assert.equal((await m.prod.obtenerProducto(a.id))!.estado, "consignacion_afuera");
  const items = await m.cons.consignacionesEntregadasLista(rev);
  await m.cons.resolverEntregada(items.find((x) => x.it.productoId === a.id)!.it.id, "vendida", A);
  await m.cons.resolverEntregada(items.find((x) => x.it.productoId === b.id)!.it.id, "devuelta", A);
  assert.equal((await m.prod.obtenerProducto(a.id))!.estado, "vendido");
  assert.equal((await m.prod.obtenerProducto(b.id))!.estado, "disponible");
  assert.equal((await m.prov.saldos([rev])).get(rev)?.ARS, -80000_00, "nos debe 80.000");
  await m.comp.registrarPago(rev, { fecha: new Date(), moneda: "ARS", importe: 80000_00, medio: "efectivo", tipoCambio: 1, imputaciones: [], sentido: "cobro" }, A);
  assert.equal((await m.prov.saldos([rev])).get(rev)?.ARS ?? 0, 0);
});

test("sugerencia de reposición: artículos por debajo del mínimo", async () => {
  const p = await m.prod.crearProducto({ ...piezaNueva("Estuches", "cantidad"), tipo: "packaging", leyId: null, origen: "compra", proveedorId: provId, cantidad: 2, stockMinimo: 10, costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS", precioLista: 0 } as never, A);
  const s = (await m.rep.sugerenciaReposicion()).find((x) => x.p.id === p.id)!;
  assert.equal(s.sugerido, 18);
  assert.equal(s.proveedor, "Proveedor SA");
});

test("datos de ejemplo del módulo 4: se cargan y se quitan sin tocar lo real", async () => {
  const antesCli = (await m.db.db.select().from(m.db.clientes)).length;
  const antesProv = (await m.db.db.select().from(m.db.proveedores)).length;
  assert.equal(await m.demo.cargarDemoM4(), 8);
  await m.demo.quitarDemo(A);
  assert.equal((await m.db.db.select().from(m.db.clientes)).length, antesCli);
  assert.equal((await m.db.db.select().from(m.db.proveedores)).length, antesProv);
});

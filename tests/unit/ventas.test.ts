import assert from "node:assert/strict";
import { before, test } from "node:test";
import { basePrueba } from "./preparar";

let m: {
  db: typeof import("../../src/db");
  motor: typeof import("../../src/lib/ventas/motor");
  cobros: typeof import("../../src/lib/ventas/cobros");
  medios: typeof import("../../src/lib/ventas/medios");
  vales: typeof import("../../src/lib/ventas/vales");
  pres: typeof import("../../src/lib/ventas/presupuestos");
  res: typeof import("../../src/lib/ventas/reservas");
  cons: typeof import("../../src/lib/ventas/consultas");
  rep: typeof import("../../src/lib/taller/reparaciones");
  ped: typeof import("../../src/lib/taller/pedidos");
  prod: typeof import("../../src/lib/stock/productos");
  cli: typeof import("../../src/lib/clientes/clientes");
  prov: typeof import("../../src/lib/proveedores/proveedores");
  gestion: typeof import("../../src/lib/cotizaciones/gestion");
  metal: typeof import("../../src/lib/stock/metal");
};
const A = { id: 1, nombre: "Admin" };
const P = { modificarPrecios: false, sinFacturar: false, descuentoMaxPct: 1000, autorizadoPor: null };
let ley18 = 0;
let cliente = 0;
let medio: Record<string, number> = {};

const pieza = async (nombre: string, precio = 100000_00, x: Record<string, unknown> = {}) =>
  (
    await m.prod.crearProducto(
      { codigo: "", codigoBarras: null, nombre, tipo: "unica", categoriaId: null, leyId: ley18, metalDetalle: null, pesoBrutoMg: 2000, pesoNetoMg: 2000, medidas: null, talle: null, descripcion: null, notasInternas: null, costoMetal: 40000_00, costoManoObra: 0, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS", modoPrecio: "fijo", precioLista: precio, precioOferta: null, monedaPrecio: "ARS", hechura: 0, ivaPct: 2100, origen: "compra", consignante: null, ubicacionId: null, cantidad: 1, stockMinimo: 0, piedras: [], coleccion: null, artesano: null, ...x } as never,
      A,
    )
  ).id;
const estado = async (id: number) => (await m.prod.obtenerProducto(id))!;
const efectivo = (aplicado: number) => ({ medioId: medio.Efectivo, aplicado });

before(async () => {
  await basePrueba();
  m = {
    db: await import("../../src/db"),
    motor: await import("../../src/lib/ventas/motor"),
    cobros: await import("../../src/lib/ventas/cobros"),
    medios: await import("../../src/lib/ventas/medios"),
    vales: await import("../../src/lib/ventas/vales"),
    pres: await import("../../src/lib/ventas/presupuestos"),
    res: await import("../../src/lib/ventas/reservas"),
    cons: await import("../../src/lib/ventas/consultas"),
    rep: await import("../../src/lib/taller/reparaciones"),
    ped: await import("../../src/lib/taller/pedidos"),
    prod: await import("../../src/lib/stock/productos"),
    cli: await import("../../src/lib/clientes/clientes"),
    prov: await import("../../src/lib/proveedores/proveedores"),
    gestion: await import("../../src/lib/cotizaciones/gestion"),
    metal: await import("../../src/lib/stock/metal"),
  };
  for (const l of m.gestion.LEYES_INICIALES) await m.gestion.guardarLey(null, l, A);
  ley18 = (await m.db.db.select().from(m.db.leyesMetal)).find((l) => l.nombre === "Oro 18k")!.id;
  await m.gestion.cargarManual("USD_BLUE", 1000, 1050, true, "", A);
  await m.gestion.cargarManual("XAU", 3110.35, 3110.35, true, "", A);
  await m.medios.cargarMediosIniciales();
  medio = Object.fromEntries((await m.medios.listarMedios()).map((x) => [x.nombre, x.id]));
  cliente = await m.cli.crearCliente({ nombre: "Clienta Prueba", tipoDoc: "DNI", documento: "30111222", condicionIva: "consumidor_final" }, A);
  // vendedor con 3 % de comisión
  await m.db.db.insert(m.db.usuarios).values({ id: 1, usuario: "admin", nombre: "Admin", rol: "admin", claveHash: "x", comisionPct: 300 });
});

test("venta al contado: pieza vendida, stock, cobro, comisión y foto de cotizaciones", async () => {
  const id = await pieza("Anillo contado");
  const v = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(100000_00)], tipoComprobante: "factura" }, P, A);
  assert.equal(v.numero, 1);
  assert.equal((await estado(id)).estado, "vendido");
  const venta = (await m.cons.obtenerVenta(v.id))!;
  assert.equal(venta.total, 100000_00);
  assert.equal(venta.comision, 3000_00);
  assert.equal(venta.items[0].i.costoUnitario, 40000_00);
  assert.ok(JSON.parse(venta.cotizaciones!).valores.USD_BLUE);
  assert.equal(venta.estadoFiscal, "pendiente");
});

test("una pieza única no se vende dos veces (estado y base de datos)", async () => {
  const id = await pieza("Única");
  await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(100000_00)], tipoComprobante: "factura" }, P, A);
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(100000_00)], tipoComprobante: "factura" }, P, A), /no está disponible/);
  // aunque alguien forzara el estado, el índice único lo impide
  await m.db.db.update(m.db.productos).set({ estado: "disponible" }).where((await import("drizzle-orm")).eq(m.db.productos.id, id));
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(100000_00)], tipoComprobante: "factura" }, P, A));
});

test("el precio lo calcula el sistema: no se puede cambiar sin permiso", async () => {
  const id = await pieza("Precio fijo");
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1, precioUnitario: 1_00 }], canjes: [], descuentoPct: 0, pagos: [efectivo(1_00)], tipoComprobante: "factura" }, P, A), /permiso/);
});

test("descuento: hasta el máximo sin clave; por encima pide autorización", async () => {
  const id = await pieza("Con descuento");
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 1500, pagos: [efectivo(85000_00)], tipoComprobante: "factura" }, P, A), (e: unknown) => e instanceof m.motor.ErrorDescuento);
  const v = await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 1500, pagos: [efectivo(85000_00)], tipoComprobante: "factura" }, { ...P, autorizadoPor: 1 }, A);
  assert.equal((await m.cons.obtenerVenta(v.id))!.autorizoDescuento, 1);
});

test("varios medios: tarjeta en cuotas con recargo, dólares a la cotización de compra y cuenta corriente en plan", async () => {
  const credito = (await m.medios.listarMedios()).find((x) => x.tipo === "credito")!;
  await m.medios.guardarPlan(credito.planes.find((p) => p.cuotas === 3)!.id, { medioId: credito.id, cuotas: 3, recargoPct: 1500, activo: true }, A);
  const id = await pieza("Pago mixto", 300000_00);
  const v = await m.motor.registrarVenta(
    {
      clienteId: cliente,
      listaId: null,
      items: [{ tipo: "pieza", productoId: id, cantidad: 1 }],
      canjes: [],
      descuentoPct: 0,
      pagos: [
        { medioId: credito.id, aplicado: 100000_00, cuotas: 3 },
        { medioId: medio["Efectivo en dólares"], aplicado: 100000_00 },
        { medioId: medio["Cuenta corriente"], aplicado: 100000_00, planCc: 2 },
      ],
      tipoComprobante: "factura",
    },
    P,
    A,
  );
  const venta = (await m.cons.obtenerVenta(v.id))!;
  assert.equal(venta.recargos, 15000_00, "15 % sobre lo pagado con tarjeta en 3 cuotas");
  const usd = venta.pagos.find((x) => x.c.moneda === "USD")!;
  assert.equal(usd.c.importe, 100_00, "100.000 ÷ 1.000 (dólar blue compra) = USD 100");
  assert.equal(venta.aCuentaCorriente, 100000_00);
  const c = (await m.cli.obtenerCliente(cliente))!;
  assert.equal(c.cc.filter((x) => x.tipo === "venta").length, 2, "dos cuotas");
  assert.equal(c.saldo, 100000_00);
});

test("no se puede dejar en cuenta corriente sin cliente; los pagos tienen que cubrir el total", async () => {
  const id = await pieza("Sin cliente");
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Cuenta corriente"], aplicado: 100000_00 }], tipoComprobante: "factura" }, P, A), /cliente/);
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(50000_00)], tipoComprobante: "factura" }, P, A), /Falta cobrar/);
});

test("canje de oro usado: se descuenta del total, entra al metal propio y exige DNI", async () => {
  const id = await pieza("Con canje", 500000_00);
  const sinDoc = await m.cli.crearCliente({ nombre: "Sin documento", tipoDoc: null, documento: null, condicionIva: "consumidor_final" }, A);
  const canje = { leyId: ley18, pesoMg: 2000, descripcion: "Cadena rota", destino: "metal" as const };
  await assert.rejects(m.motor.registrarVenta({ clienteId: sinDoc, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [canje], descuentoPct: 0, pagos: [efectivo(1)], tipoComprobante: "factura" }, P, A), /DNI/);
  // gramo 18k: 3110,35/31,1035 × 0,75 × 1050 = 78.750 (compra de usado sin ajuste) → 2 g = 157.500
  const { valor } = await m.motor.valorCanje(canje);
  assert.equal(valor, 157500_00);
  const v = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [canje], descuentoPct: 0, pagos: [efectivo(500000_00 - valor)], tipoComprobante: "factura" }, P, A);
  assert.equal((await m.cons.obtenerVenta(v.id))!.total, 342500_00);
  assert.equal((await m.metal.saldoMetal()).find((x) => x.leyId === ley18)?.gramos, 2);
});

test("gift card: se vende, se usa como pago y no deja usar más del saldo", async () => {
  const v = await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "gift_card", monto: 50000_00 }], canjes: [], descuentoPct: 0, pagos: [efectivo(50000_00)], tipoComprobante: "factura" }, P, A);
  const codigo = (await m.cons.obtenerVenta(v.id))!.items[0].i.descripcion.replace("Gift card ", "");
  const id = await pieza("Pagada con gift card", 80000_00);
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Gift card / vale"], aplicado: 80000_00, valeCodigo: codigo }], tipoComprobante: "factura" }, P, A), /saldo/);
  await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Gift card / vale"], aplicado: 50000_00, valeCodigo: codigo }, efectivo(30000_00)], tipoComprobante: "factura" }, P, A);
  assert.equal((await m.vales.consultarVale(codigo))!.saldo, 0);
});

test("reserva con seña: la pieza queda señada; la seña se usa al retirar con el precio congelado", async () => {
  const id = await pieza("Reservada", 200000_00);
  const r = await m.res.crearReserva({ clienteId: cliente, productoIds: [id], dias: 7, precioCongelado: true, sena: [efectivo(50000_00)] }, A);
  assert.equal((await estado(id)).estado, "senado");
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(200000_00)], tipoComprobante: "factura" }, P, A), /no está disponible/);
  // sube el precio de lista: igual se cobra el congelado
  await m.db.db.update(m.db.productos).set({ precioLista: 250000_00 }).where((await import("drizzle-orm")).eq(m.db.productos.id, id));
  const saldoAntes = (await m.cli.obtenerCliente(cliente))!.saldo;
  const v = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, reservaId: r, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Saldo a favor / seña"], aplicado: 50000_00, senaRef: `reserva:${r}` }, efectivo(150000_00)], tipoComprobante: "factura" }, P, A);
  assert.equal((await m.cons.obtenerVenta(v.id))!.total, 200000_00);
  assert.equal((await m.cli.obtenerCliente(cliente))!.saldo, saldoAntes + 50000_00, "se consumió la seña a favor");
  assert.equal(await m.cobros.senaDisponible(`reserva:${r}`), 0);
  assert.equal((await m.res.listarReservas()).find((x) => x.r.id === r)!.r.estado, "convertida");
});

test("reserva vencida: libera la pieza y avisa", async () => {
  const id = await pieza("Vence");
  const r = await m.res.crearReserva({ clienteId: cliente, productoIds: [id], dias: 1, precioCongelado: false, sena: [] }, A);
  await m.db.db.update(m.db.reservas).set({ vence: new Date(Date.now() - 1000) }).where((await import("drizzle-orm")).eq(m.db.reservas.id, r));
  assert.equal(await m.res.vencerReservas(), 1);
  assert.equal((await estado(id)).estado, "disponible");
});

test("presupuesto vigente respeta su precio; vencido se recalcula", async () => {
  const id = await pieza("Presupuestada", 100000_00);
  const pr = await m.pres.crearPresupuesto({ clienteId: cliente, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], descuentoPct: 0, validezDias: 7 }, P, A);
  await m.db.db.update(m.db.productos).set({ precioLista: 120000_00 }).where((await import("drizzle-orm")).eq(m.db.productos.id, id));
  const ctx = await (await import("../../src/lib/stock/consultas")).contextoPrecios();
  const ren = await m.db.db.transaction((tx) => m.motor.armarRenglones(tx, { items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], listaId: null, presupuestoId: pr.id, reservaId: null, clienteId: cliente }, P, ctx));
  assert.equal(ren[0].precioUnitario, 100000_00);
  await m.db.db.update(m.db.presupuestos).set({ vence: new Date(Date.now() - 1000) }).where((await import("drizzle-orm")).eq(m.db.presupuestos.id, pr.id));
  const ren2 = await m.db.db.transaction((tx) => m.motor.armarRenglones(tx, { items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], listaId: null, presupuestoId: pr.id, reservaId: null, clienteId: cliente }, P, ctx));
  assert.equal(ren2[0].precioUnitario, 120000_00);
});

test("devolución con vale y anulación de venta revierten stock y cobros", async () => {
  const a = await pieza("Se devuelve");
  const b = await pieza("Se anula");
  const v1 = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, items: [{ tipo: "pieza", productoId: a, cantidad: 1 }], canjes: [], descuentoPct: 1000, pagos: [efectivo(90000_00)], tipoComprobante: "factura" }, P, A);
  const it = (await m.cons.obtenerVenta(v1.id))!.items[0].i;
  const d = await m.motor.registrarDevolucion(v1.id, { items: [{ itemId: it.id, cantidad: 1 }], forma: "vale", motivo: "No le gustó" }, A);
  assert.equal(d.importe, 90000_00, "lo que pagó, con el descuento");
  assert.equal((await estado(a)).estado, "disponible");
  assert.equal((await m.vales.consultarVale(d.valeCodigo!))!.saldo, 90000_00);
  // la pieza devuelta se puede vender de nuevo (el índice único la liberó)
  await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: a, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Gift card / vale"], aplicado: 90000_00, valeCodigo: d.valeCodigo }, efectivo(10000_00)], tipoComprobante: "factura" }, P, A);
  const v2 = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, items: [{ tipo: "pieza", productoId: b, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Cuenta corriente"], aplicado: 100000_00 }], tipoComprobante: "factura" }, P, A);
  const saldo = (await m.cli.obtenerCliente(cliente))!.saldo;
  await m.motor.anularVenta(v2.id, "error de carga", A);
  assert.equal((await estado(b)).estado, "disponible");
  assert.equal((await m.cli.obtenerCliente(cliente))!.saldo, saldo - 100000_00);
});

test("venta de una pieza en consignación genera la deuda con el consignante; anularla la quita", async () => {
  const dueno = await m.prov.crearProveedor({ razonSocial: "Artesana", condicionIva: "monotributo", rubros: ["artesano"], diasPago: 0 }, A);
  const id = await pieza("Consignada", 150000_00, { origen: "consignacion", proveedorId: dueno, costoMetal: 0, costoManoObra: 90000_00 });
  const v = await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(150000_00)], tipoComprobante: "factura" }, P, A);
  assert.equal((await m.prov.saldos([dueno])).get(dueno)?.ARS, 90000_00);
  await m.motor.anularVenta(v.id, "prueba", A);
  assert.equal((await m.prov.saldos([dueno])).get(dueno)?.ARS ?? 0, 0);
});

test("venta sin facturar solo con permiso", async () => {
  const id = await pieza("Interna");
  await assert.rejects(m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(100000_00)], tipoComprobante: "interno" }, P, A), /permiso/);
  const v = await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: id, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(100000_00)], tipoComprobante: "interno" }, { ...P, sinFacturar: true }, A);
  const lista = await m.cons.listarVentas({}, { usuarioId: 1, verTodas: true, verSinFacturar: false });
  assert.ok(!lista.some((x) => x.v.id === v.id), "quien no tiene permiso no la ve");
});

test("reparación: seña, taller externo (deuda), aviso y cobro al entregar", async () => {
  const taller = await m.prov.crearProveedor({ razonSocial: "Taller externo", condicionIva: "monotributo", rubros: ["taller"], diasPago: 0 }, A);
  await m.cli.editarCliente(cliente, { nombre: "Clienta Prueba", tipoDoc: "DNI", documento: "30111222", condicionIva: "consumidor_final", whatsapp: "341 155 123456" }, A);
  const r = await m.rep.crearReparacion({ clienteId: cliente, descripcion: "Anillo con piedra floja", trabajos: ["engarzado"], pesoIngresoMg: 3200, presupuesto: 25000_00, fechaPrometida: new Date(Date.now() + 5 * 86400_000), sena: [efectivo(10000_00)] }, A);
  assert.equal(r.numero, 1);
  await assert.rejects(m.rep.cambiarEstadoReparacion(r.id, "entregada", {}, A), /mostrador/);
  await m.rep.cambiarEstadoReparacion(r.id, "en_taller", { proveedorId: taller }, A);
  await m.rep.cambiarEstadoReparacion(r.id, "lista", { costoTaller: 8000_00 }, A);
  assert.equal((await m.prov.saldos([taller])).get(taller)?.ARS, 8000_00);
  assert.match((await m.rep.enlaceAvisoReparacion(r.id))!, /wa\.me\/5493415123456/);
  const v = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, items: [{ tipo: "servicio", referencia: `reparacion:${r.id}` }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Saldo a favor / seña"], aplicado: 10000_00, senaRef: `reparacion:${r.id}` }, efectivo(15000_00)], tipoComprobante: "factura" }, P, A);
  assert.equal((await m.cons.obtenerVenta(v.id))!.total, 25000_00);
  assert.equal((await m.rep.obtenerReparacion(r.id))!.estado, "entregada");
});

test("pedido a medida a la cotización del día, con metal entregado al taller y merma", async () => {
  const p = await m.ped.crearPedido({ clienteId: cliente, descripcion: "Anillo de compromiso con iniciales", leyId: ley18, modoPrecio: "cotizacion", presupuesto: 0, gramosEstimadosMg: 4000, hechura: 120000_00, entregaEstimada: null, sena: [efectivo(100000_00)] }, A);
  assert.equal((await m.ped.obtenerPedido(p.id))!.estado, "aprobado");
  await m.ped.metalTaller(p.id, { entregaMg: 5000 }, A);
  await m.ped.cambiarEstadoPedido(p.id, "en_taller", {}, A);
  await m.ped.metalTaller(p.id, { devolucionMg: 700 }, A);
  await m.ped.cambiarEstadoPedido(p.id, "listo", { pesoFinalMg: 4200 }, A);
  assert.equal((await m.ped.obtenerPedido(p.id))!.merma, 100, "5 g − 0,7 − 4,2 = 0,1 g");
  // precio: 4,2 g × gramo venta 18k (78.750) + hechura 120.000 = 450.750
  const v = await m.motor.registrarVenta({ clienteId: cliente, listaId: null, items: [{ tipo: "servicio", referencia: `pedido:${p.id}` }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Saldo a favor / seña"], aplicado: 100000_00, senaRef: `pedido:${p.id}` }, efectivo(350750_00)], tipoComprobante: "factura" }, P, A);
  assert.equal((await m.cons.obtenerVenta(v.id))!.total, 450750_00);
});

test("cobro de cuenta corriente y garantías vigentes del cliente", async () => {
  const saldo = (await m.cli.obtenerCliente(cliente))!.saldo;
  await m.cobros.registrarCobroCliente(cliente, { origen: "cobro_cc", referencia: null, descripcion: "Pago a cuenta", pagos: [{ medioId: medio.Transferencia, aplicado: 20000_00 }] }, A);
  assert.equal((await m.cli.obtenerCliente(cliente))!.saldo, saldo - 20000_00);
  const g = await m.cons.garantiasVigentes(cliente);
  assert.ok(g.length > 0);
  assert.ok(g[0].hasta.getTime() > Date.now());
});

test("quitar los datos de ejemplo borra las ventas y reparaciones de prueba, pero no una venta con piezas reales", async () => {
  const demo = await import("../../src/lib/stock/demo");
  const { eq, inArray } = await import("drizzle-orm");
  const real = await pieza("Anillo real");
  const ejemplo = await pieza("Anillo de ejemplo");
  const otraEjemplo = await pieza("Aros de ejemplo");
  await m.db.db.update(m.db.productos).set({ esDemo: true }).where(inArray(m.db.productos.id, [ejemplo, otraEjemplo]));
  const cliDemo = await m.cli.crearCliente({ nombre: "Cliente de ejemplo", tipoDoc: null, documento: null, condicionIva: "consumidor_final" }, A, { esDemo: true });
  // Venta mezclada (pieza real + de ejemplo): bloquea.
  const mezcla = await m.motor.registrarVenta({ clienteId: null, listaId: null, items: [{ tipo: "pieza", productoId: real, cantidad: 1 }, { tipo: "pieza", productoId: ejemplo, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [efectivo(200000_00)], tipoComprobante: "factura" }, P, A);
  await assert.rejects(demo.quitarDemo(A), /piezas reales/);
  // Anulada, ya se puede.
  await m.motor.anularVenta(mezcla.id, "prueba", A);
  const prueba = await m.motor.registrarVenta({ clienteId: cliDemo, listaId: null, items: [{ tipo: "pieza", productoId: otraEjemplo, cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: medio["Cuenta corriente"], aplicado: 100000_00 }], tipoComprobante: "factura" }, P, A);
  await m.rep.crearReparacion({ clienteId: cliDemo, descripcion: "Reparación de ejemplo", trabajos: ["limpieza"], pesoIngresoMg: null, presupuesto: 5000_00, fechaPrometida: null, sena: [efectivo(1000_00)] }, A);
  await demo.quitarDemo(A);
  assert.equal(await m.cons.obtenerVenta(prueba.id), null);
  assert.equal(await m.cons.obtenerVenta(mezcla.id), null);
  assert.equal((await estado(real)).estado, "disponible");
  const quedan = await m.db.db.select().from(m.db.reparaciones).where(eq(m.db.reparaciones.clienteId, cliDemo));
  assert.equal(quedan.length, 0);
});

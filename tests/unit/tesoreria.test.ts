import assert from "node:assert/strict";
import { before, test } from "node:test";
import { basePrueba } from "./preparar";

let m: {
  db: typeof import("../../src/db");
  cajas: typeof import("../../src/lib/tesoreria/cajas");
  acred: typeof import("../../src/lib/tesoreria/acreditaciones");
  arq: typeof import("../../src/lib/tesoreria/arqueos");
  ch: typeof import("../../src/lib/tesoreria/cheques");
  flujo: typeof import("../../src/lib/tesoreria/flujo");
  conc: typeof import("../../src/lib/tesoreria/conciliacion");
  reint: typeof import("../../src/lib/tesoreria/reintegros");
  motor: typeof import("../../src/lib/ventas/motor");
  cobros: typeof import("../../src/lib/ventas/cobros");
  medios: typeof import("../../src/lib/ventas/medios");
  prod: typeof import("../../src/lib/stock/productos");
  cli: typeof import("../../src/lib/clientes/clientes");
  prov: typeof import("../../src/lib/proveedores/proveedores");
  comp: typeof import("../../src/lib/proveedores/compras");
  gestion: typeof import("../../src/lib/cotizaciones/gestion");
};
const A = { id: 1, nombre: "Admin" };
const P = { modificarPrecios: false, sinFacturar: false, descuentoMaxPct: 1000, autorizadoPor: null };
let ley18 = 0;
let cliente = 0;
let proveedor = 0;
let medio: Record<string, number> = {};
let caja: Record<string, number> = {};

const pieza = async (nombre: string, precio = 100000_00) =>
  (
    await m.prod.crearProducto(
      { codigo: "", codigoBarras: null, nombre, tipo: "unica", categoriaId: null, leyId: ley18, metalDetalle: null, pesoBrutoMg: 2000, pesoNetoMg: 2000, medidas: null, talle: null, descripcion: null, notasInternas: null, costoMetal: 40000_00, costoManoObra: 0, costoPiedras: 0, costoOtros: 0, monedaCosto: "ARS", modoPrecio: "fijo", precioLista: precio, precioOferta: null, monedaPrecio: "ARS", hechura: 0, ivaPct: 2100, origen: "compra", consignante: null, ubicacionId: null, cantidad: 1, stockMinimo: 0, piedras: [], coleccion: null, artesano: null } as never,
      A,
    )
  ).id;
const saldo = (nombre: string) => m.cajas.saldoCaja(caja[nombre]);
const vender = async (precio: number, pagos: { medioId: number; aplicado: number; cuotas?: number; tipoCambio?: number }[], clienteId: number | null = cliente) =>
  m.motor.registrarVenta({ clienteId, listaId: null, items: [{ tipo: "pieza", productoId: await pieza(`Pieza ${Math.random()}`, precio), cantidad: 1 }], canjes: [], descuentoPct: 0, pagos, tipoComprobante: "factura" }, P, A);

before(async () => {
  await basePrueba();
  m = {
    db: await import("../../src/db"),
    cajas: await import("../../src/lib/tesoreria/cajas"),
    acred: await import("../../src/lib/tesoreria/acreditaciones"),
    arq: await import("../../src/lib/tesoreria/arqueos"),
    ch: await import("../../src/lib/tesoreria/cheques"),
    flujo: await import("../../src/lib/tesoreria/flujo"),
    conc: await import("../../src/lib/tesoreria/conciliacion"),
    reint: await import("../../src/lib/tesoreria/reintegros"),
    motor: await import("../../src/lib/ventas/motor"),
    cobros: await import("../../src/lib/ventas/cobros"),
    medios: await import("../../src/lib/ventas/medios"),
    prod: await import("../../src/lib/stock/productos"),
    cli: await import("../../src/lib/clientes/clientes"),
    prov: await import("../../src/lib/proveedores/proveedores"),
    comp: await import("../../src/lib/proveedores/compras"),
    gestion: await import("../../src/lib/cotizaciones/gestion"),
  };
  for (const l of m.gestion.LEYES_INICIALES) await m.gestion.guardarLey(null, l, A);
  ley18 = (await m.db.db.select().from(m.db.leyesMetal)).find((l) => l.nombre === "Oro 18k")!.id;
  await m.gestion.cargarManual("USD_BLUE", 1000, 1050, true, "", A);
  await m.gestion.cargarManual("XAU", 3110.35, 3110.35, true, "", A);
  await m.medios.cargarMediosIniciales();
  await m.cajas.cargarCajasIniciales();
  medio = Object.fromEntries((await m.medios.listarMedios()).map((x) => [x.nombre, x.id]));
  caja = Object.fromEntries((await m.cajas.listarCajas()).map((x) => [x.nombre, x.id]));
  cliente = await m.cli.crearCliente({ nombre: "Clienta Tesorería", tipoDoc: "DNI", documento: "30222333", condicionIva: "consumidor_final" }, A);
  proveedor = await m.prov.crearProveedor({ razonSocial: "Taller Uno", condicionIva: "monotributo", rubros: ["taller"], diasPago: 30 }, A);
  await m.db.db.insert(m.db.usuarios).values({ id: 1, usuario: "admin", nombre: "Admin", rol: "admin", claveHash: "x" });
});

test("cajas iniciales: cada medio de cobro entra en su caja", async () => {
  const ms = await m.medios.listarMedios();
  const cajaDe = (n: string) => ms.find((x) => x.nombre === n)!.cajaId;
  assert.equal(cajaDe("Efectivo"), caja["Caja efectivo pesos"]);
  assert.equal(cajaDe("Efectivo en dólares"), caja["Caja efectivo dólares"]);
  assert.equal(cajaDe("Tarjeta de crédito"), caja["Tarjetas a acreditar"]);
  assert.equal(cajaDe("Cuenta corriente"), null);
});

test("una venta con efectivo, dólares y tarjeta mueve cada caja; anularla las revierte", async () => {
  const v = await vender(300000_00, [
    { medioId: medio.Efectivo, aplicado: 100000_00 },
    { medioId: medio["Efectivo en dólares"], aplicado: 100000_00, tipoCambio: 1000 },
    { medioId: medio["Tarjeta de crédito"], aplicado: 100000_00, cuotas: 3 },
  ]);
  assert.equal(await saldo("Caja efectivo pesos"), 100000_00);
  assert.equal(await saldo("Caja efectivo dólares"), 100_00); // US$ 100 a 1.000
  assert.equal(await saldo("Tarjetas a acreditar"), 100000_00);
  const pend = await m.acred.listarAcreditaciones("pendiente");
  assert.equal(pend.length, 1);
  assert.equal(pend[0].a.cuotas, 3);
  await m.motor.anularVenta(v.id, "prueba", A);
  assert.equal(await saldo("Caja efectivo pesos"), 0);
  assert.equal(await saldo("Caja efectivo dólares"), 0);
  assert.equal(await saldo("Tarjetas a acreditar"), 0);
  assert.equal((await m.acred.listarAcreditaciones("pendiente")).length, 0);
});

test("acreditación de tarjetas: el neto va al banco y la comisión y las retenciones quedan como gastos", async () => {
  await vender(50000_00, [{ medioId: medio["Tarjeta de débito"], aplicado: 50000_00 }]);
  await vender(50000_00, [{ medioId: medio["Tarjeta de crédito"], aplicado: 50000_00 }]);
  const ids = (await m.acred.listarAcreditaciones("pendiente")).map((x) => x.a.id);
  await assert.rejects(m.acred.acreditar({ ids, neto: 99000_00, retencion: 2000_00, fecha: new Date(), bancoId: caja["Banco (cuenta corriente)"] }, A), /supera/);
  const r = await m.acred.acreditar({ ids, neto: 96000_00, retencion: 1500_00, fecha: new Date(), bancoId: caja["Banco (cuenta corriente)"] }, A);
  assert.equal(r.comision, 2500_00);
  assert.equal(await saldo("Tarjetas a acreditar"), 0);
  assert.equal(await saldo("Banco (cuenta corriente)"), 96000_00);
  const gastos = await m.cajas.listarMovimientos({ tipo: "gasto" });
  assert.deepEqual(gastos.map((g) => g.m.importe).sort((a, b) => a - b), [-2500_00, -1500_00]);
  assert.ok(gastos.every((g) => g.categoria));
  await assert.rejects(m.acred.acreditar({ ids, neto: 1, retencion: 0, fecha: new Date(), bancoId: caja["Banco (cuenta corriente)"] }, A), /ya se acreditó/);
});

test("transferencias, compra de dólares y gastos: el efectivo no puede quedar negativo", async () => {
  await vender(200000_00, [{ medioId: medio.Efectivo, aplicado: 200000_00 }]);
  const antes = await saldo("Caja efectivo pesos");
  await assert.rejects(m.cajas.transferir({ origenId: caja["Caja efectivo pesos"], destinoId: caja["Caja efectivo dólares"], importe: 1000 }, A), /distinta moneda/);
  await assert.rejects(m.cajas.transferir({ origenId: caja["Caja efectivo pesos"], destinoId: caja["Banco (cuenta corriente)"], importe: antes + 1 }, A), /no alcanza/);
  await m.cajas.transferir({ origenId: caja["Caja efectivo pesos"], destinoId: caja["Banco (cuenta corriente)"], importe: 50000_00, detalle: "depósito" }, A);
  const { tc } = await m.cajas.cambiarDivisas({ origenId: caja["Caja efectivo pesos"], destinoId: caja["Caja efectivo dólares"], importeOrigen: 105000_00, importeDestino: 100_00 }, A);
  assert.equal(tc, 1050);
  assert.equal(await saldo("Caja efectivo pesos"), antes - 155000_00);
  const cat = (await m.cajas.listarCategorias("gasto")).find((c) => c.nombre === "Alquiler")!;
  await m.cajas.registrarGastoIngreso({ tipo: "gasto", cajaId: caja["Banco (cuenta corriente)"], categoriaId: cat.id, importe: 30000_00, descripcion: "Alquiler de noviembre" }, A);
  const resumen = await m.cajas.resumenPorCategoria(new Date(Date.now() - 86400_000), new Date(Date.now() + 86400_000));
  assert.equal(resumen.find((r) => r.categoria === "Alquiler")!.total, -30000_00);
  // Anular una transferencia anula sus dos patas.
  const t = (await m.cajas.listarMovimientos({ tipo: "transferencia" }))[0];
  await m.cajas.anularMovimiento(t.m.id, "cargada mal", A);
  assert.equal((await m.cajas.listarMovimientos({ tipo: "transferencia" })).length, 0);
});

test("apertura y cierre con arqueo: la diferencia queda registrada y no se abre dos veces", async () => {
  const esperado = await saldo("Caja efectivo pesos");
  const r = await m.arq.abrirCaja(caja["Caja efectivo pesos"], esperado - 500_00, "faltan 500", A);
  assert.equal(r.diferencia, -500_00);
  assert.equal(await saldo("Caja efectivo pesos"), esperado - 500_00);
  await assert.rejects(m.arq.abrirCaja(caja["Caja efectivo pesos"], 0, "", A), /ya se abrió/);
  const c = await m.arq.cerrarCaja(caja["Caja efectivo pesos"], esperado - 500_00, "", A);
  assert.equal(c.diferencia, 0);
  await assert.rejects(m.arq.cerrarCaja(caja["Caja efectivo pesos"], 0, "", A), /ya se cerró/);
  const est = await m.arq.estadoDelDia();
  assert.ok(est.find((x) => x.caja.id === caja["Caja efectivo pesos"])!.arqueo!.cierreEn);
});

test("cheques de terceros: se reciben de un cliente, se depositan y si rebotan vuelve la deuda", async () => {
  await vender(80000_00, [{ medioId: medio["Cuenta corriente"], aplicado: 80000_00 }]);
  const deuda = await m.cobros.saldoCliente(cliente);
  const hoy = new Date();
  const id = await m.ch.recibirCheque({ numero: "0012345", banco: "Banco Nación", importe: 80000_00, fechaEmision: hoy, fechaPago: new Date(Date.now() + 5 * 86400_000), clienteId: cliente }, A);
  assert.equal(await m.cobros.saldoCliente(cliente), deuda - 80000_00);
  assert.equal(await saldo("Cheques en cartera"), 80000_00);
  const banco = await saldo("Banco (cuenta corriente)");
  await m.ch.depositarCheque(id, caja["Banco (cuenta corriente)"], A);
  assert.equal(await saldo("Cheques en cartera"), 0);
  assert.equal(await saldo("Banco (cuenta corriente)"), banco + 80000_00);
  await m.ch.rechazarCheque(id, "sin fondos", A);
  assert.equal(await saldo("Banco (cuenta corriente)"), banco);
  assert.equal(await m.cobros.saldoCliente(cliente), deuda);
});

test("pagos a proveedores: desde una caja, endosando un cheque (anular lo devuelve a la cartera) y con cheque propio", async () => {
  await m.prov.movimientoCcProveedorManual(proveedor, { tipo: "saldo_inicial", moneda: "ARS", importe: 500000_00, descripcion: "deuda anterior", vencimiento: null }, A);
  const banco = await saldo("Banco (cuenta corriente)");
  await assert.rejects(m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 1000_00, medio: "transferencia", tipoCambio: 1, imputaciones: [], sentido: "pago", exigirCaja: true }, A), /Elegí la caja/);
  await assert.rejects(m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "USD", importe: 1000, medio: "efectivo", tipoCambio: 1000, imputaciones: [], sentido: "pago", cajaId: caja["Caja efectivo pesos"] }, A), /es en ARS/);
  const p1 = await m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 10000_00, medio: "transferencia", tipoCambio: 1, imputaciones: [], sentido: "pago", cajaId: caja["Banco (cuenta corriente)"] }, A);
  assert.equal(await saldo("Banco (cuenta corriente)"), banco - 10000_00);
  await m.comp.anularPago(p1, "duplicado", A);
  assert.equal(await saldo("Banco (cuenta corriente)"), banco);

  const chId = await m.ch.recibirCheque({ numero: "777", banco: "Galicia", importe: 20000_00, fechaEmision: new Date(), fechaPago: new Date(), categoriaId: (await m.cajas.listarCategorias("ingreso"))[0].id }, A);
  await assert.rejects(m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 15000_00, medio: "cheque", tipoCambio: 1, imputaciones: [], sentido: "pago", chequeTerceroId: chId }, A), /tiene que ser por ese importe/);
  const p2 = await m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 20000_00, medio: "cheque", tipoCambio: 1, imputaciones: [], sentido: "pago", chequeTerceroId: chId }, A);
  assert.equal(await saldo("Cheques en cartera"), 0);
  await m.comp.anularPago(p2, "se lo devolvimos", A);
  assert.equal(await saldo("Cheques en cartera"), 20000_00);
  assert.equal((await m.ch.listarCheques({ tipo: "tercero" })).find((x) => x.c.id === chId)!.c.estado, "en_cartera");

  await m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 30000_00, medio: "cheque", tipoCambio: 1, imputaciones: [], sentido: "pago", chequePropio: { numero: "A-100", bancoCajaId: caja["Banco (cuenta corriente)"], fechaPago: new Date(Date.now() + 30 * 86400_000) } }, A);
  const propio = (await m.ch.listarCheques({ tipo: "propio" }))[0];
  assert.equal(propio.c.estado, "emitido");
  assert.equal(await saldo("Banco (cuenta corriente)"), banco); // todavía no se debitó
  await m.ch.debitarCheque(propio.c.id, A);
  assert.equal(await saldo("Banco (cuenta corriente)"), banco - 30000_00);
  const saldoProv = (await m.prov.saldos([proveedor])).get(proveedor)!.ARS;
  assert.equal(saldoProv, 500000_00 - 30000_00);
});

test("pago en metal: salen los gramos del metal propio", async () => {
  const metal = await import("../../src/lib/stock/metal");
  await m.comp.registrarCompra({ proveedorId: proveedor, fecha: new Date(), tipoComprobante: "X", puntoVenta: null, numero: null, moneda: "ARS", tipoCambio: 1, condicion: "cuenta_corriente", vencimiento: null, percepcionIva: 0, percepcionIibb: 0, otrosImpuestos: 0, items: [{ tipo: "metal", leyId: ley18, pesoMg: 10000, costoUnitario: 80000_00, ivaPct: 0 }] }, A);
  const antes = (await metal.saldoMetal()).find((x) => x.leyId === ley18)!.gramos;
  await assert.rejects(m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 1, medio: "metal", tipoCambio: 1, imputaciones: [], sentido: "pago", metal: { leyId: ley18, pesoMg: 999_000 } }, A), /No hay tanto metal/);
  const id = await m.comp.registrarPago(proveedor, { fecha: new Date(), moneda: "ARS", importe: 300000_00, medio: "metal", tipoCambio: 1, imputaciones: [], sentido: "pago", metal: { leyId: ley18, pesoMg: 4000 } }, A);
  assert.equal((await metal.saldoMetal()).find((x) => x.leyId === ley18)!.gramos, antes - 4);
  await m.comp.anularPago(id, "error", A);
  assert.equal((await metal.saldoMetal()).find((x) => x.leyId === ley18)!.gramos, antes);
});

test("devolución con reintegro sale de la caja; devolver saldo a favor también", async () => {
  const v = await vender(40000_00, [{ medioId: medio.Efectivo, aplicado: 40000_00 }]);
  const antes = await saldo("Caja efectivo pesos");
  const it = (await m.db.db.select().from(m.db.ventaItems).where((await import("drizzle-orm")).eq(m.db.ventaItems.ventaId, v.id)))[0];
  await assert.rejects(m.motor.registrarDevolucion(v.id, { items: [{ itemId: it.id, cantidad: 1 }], forma: "reintegro", motivo: "no le gustó" }, A), /de qué caja/);
  await m.motor.registrarDevolucion(v.id, { items: [{ itemId: it.id, cantidad: 1 }], forma: "reintegro", motivo: "no le gustó", cajaId: caja["Caja efectivo pesos"] }, A);
  assert.equal(await saldo("Caja efectivo pesos"), antes - 40000_00);
  const otra = await m.cli.crearCliente({ nombre: "Con seña", tipoDoc: null, documento: null, condicionIva: "consumidor_final" }, A);
  await m.cobros.registrarCobroCliente(otra, { origen: "cobro_cc", referencia: null, descripcion: "a cuenta", pagos: [{ medioId: medio.Efectivo, aplicado: 5000_00 }] }, A);
  await assert.rejects(m.reint.devolverSaldoCliente(otra, { importe: 6000_00, cajaId: caja["Caja efectivo pesos"], motivo: "se arrepintió" }, A), /tiene/);
  await m.reint.devolverSaldoCliente(otra, { importe: 5000_00, cajaId: caja["Caja efectivo pesos"], motivo: "se arrepintió" }, A);
  assert.equal(await m.cobros.saldoCliente(otra), 0);
  assert.equal(await saldo("Caja efectivo pesos"), antes - 40000_00);
});

test("flujo de fondos: tarjetas, cheques, cuotas de clientes y facturas de proveedores", async () => {
  await vender(60000_00, [{ medioId: medio["Cuenta corriente"], aplicado: 60000_00, planCc: 3 } as never]);
  await vender(10000_00, [{ medioId: medio["Tarjeta de débito"], aplicado: 10000_00 }]);
  const f = await m.flujo.flujoDeFondos("semana", 8);
  const todas = [...f.vencido.partidas, ...f.filas.flatMap((x) => x.partidas), ...f.despues.partidas];
  assert.ok(todas.some((p) => p.tipo === "tarjeta" && p.importe === 10000_00));
  assert.ok(todas.some((p) => p.tipo === "cheque_tercero" && p.importe === 20000_00));
  assert.ok(todas.filter((p) => p.tipo === "cliente").length >= 3);
  assert.ok(todas.some((p) => p.tipo === "proveedor" && p.importe === -800000_00));
  const ultimo = f.filas.at(-1)!;
  const neto = todas.filter((p) => !f.despues.partidas.includes(p)).reduce((s, p) => s + p.importe, 0);
  assert.equal(ultimo.saldo, f.disponible + neto);
});

test("conciliación bancaria: lee el extracto, propone coincidencias y registra lo que falta", async () => {
  const banco = caja["Banco (cuenta corriente)"];
  const movs = await m.cajas.listarMovimientos({ cajaId: banco });
  const uno = movs.find((x) => x.m.descripcion.includes("A-100"))!; // débito del cheque propio (hay otro de igual importe: el alquiler)
  const fecha = uno.m.fecha.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const csv = `Fecha;Concepto;Débito;Crédito\n${fecha};DEBITO CHEQUE A-100;30.000,00;\n${fecha};COMISION MANTENIMIENTO;1.250,50;\n`;
  const renglones = await m.conc.leerExtracto("extracto.csv", Buffer.from(csv));
  assert.deepEqual(renglones.map((r) => r.importe), [-30000_00, -1250_50]);
  const { propuestas } = await m.conc.proponer(banco, renglones);
  assert.equal(propuestas[0].movimiento?.id, uno.m.id);
  assert.equal(propuestas[1].movimiento, null);
  const r = await m.conc.confirmarConciliacion(banco, propuestas.map((p) => ({ ...p, movimientoId: p.movimiento?.id ?? null })), A);
  assert.deepEqual(r, { conciliados: 1, pendientes: 1 });
  const [linea] = await m.conc.lineasPendientes(banco);
  await m.conc.registrarLinea(linea.id, (await m.cajas.listarCategorias("gasto")).find((c) => c.nombre.startsWith("Comisiones"))!.id, A);
  assert.equal((await m.conc.lineasPendientes(banco)).length, 0);
  await assert.rejects(m.cajas.anularMovimiento((await m.cajas.listarMovimientos({ cajaId: banco, texto: "Según extracto" }))[0].m.id, "prueba", A), /conciliado/);
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import forge from "node-forge";
import { basePrueba } from "./preparar";

process.env.ARCA_DIR = mkdtempSync(path.join(tmpdir(), "mc-arca-"));

let m: {
  db: typeof import("../../src/db");
  calc: typeof import("../../src/lib/facturacion/calculo");
  emi: typeof import("../../src/lib/facturacion/emision");
  libros: typeof import("../../src/lib/facturacion/libros");
  pdf: typeof import("../../src/lib/facturacion/pdf");
  wsfe: typeof import("../../src/lib/arca/wsfe");
  wsaa: typeof import("../../src/lib/arca/wsaa");
  soap: typeof import("../../src/lib/arca/soap");
  certs: typeof import("../../src/lib/arca/certificados");
  config: typeof import("../../src/lib/config");
  motor: typeof import("../../src/lib/ventas/motor");
  medios: typeof import("../../src/lib/ventas/medios");
  cajas: typeof import("../../src/lib/tesoreria/cajas");
  prod: typeof import("../../src/lib/stock/productos");
  cli: typeof import("../../src/lib/clientes/clientes");
  gestion: typeof import("../../src/lib/cotizaciones/gestion");
};
const A = { id: 1, nombre: "Admin" };
const P = { modificarPrecios: false, sinFacturar: true, descuentoMaxPct: 10000, autorizadoPor: null };
let efectivo = 0;
let cf = 0;
let ri = 0;

const pieza = async (precio: number, x: Record<string, unknown> = {}) =>
  (
    await m.prod.crearProducto(
      { codigo: "", codigoBarras: null, nombre: `Pieza ${Math.random()}`, tipo: "unica", categoriaId: null, leyId: null, metalDetalle: null, pesoBrutoMg: null, pesoNetoMg: null, medidas: null, talle: null, descripcion: null, notasInternas: null, costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: 60000_00, monedaCosto: "ARS", modoPrecio: "fijo", precioLista: precio, precioOferta: null, monedaPrecio: "ARS", hechura: 0, ivaPct: 2100, origen: "compra", consignante: null, ubicacionId: null, cantidad: 1, stockMinimo: 0, piedras: [], coleccion: null, artesano: null, ...x } as never,
      A,
    )
  ).id;
const vender = async (precio: number, clienteId: number | null, tipo: "factura" | "interno" = "factura", x: Record<string, unknown> = {}) =>
  m.motor.registrarVenta({ clienteId, listaId: null, items: [{ tipo: "pieza", productoId: await pieza(precio, x), cantidad: 1 }], canjes: [], descuentoPct: 0, pagos: [{ medioId: efectivo, aplicado: precio }], tipoComprobante: tipo }, P, A);

function certificadoDePrueba() {
  const k = forge.pki.rsa.generateKeyPair(1024);
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey;
  c.serialNumber = "01";
  c.validity.notBefore = new Date(Date.now() - 86400_000);
  c.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: "commonName", value: "prueba" }, { type: "2.5.4.5", value: "CUIT 20111111112" }];
  c.setSubject(attrs);
  c.setIssuer(attrs);
  c.sign(k.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(c), clave: forge.pki.privateKeyToPem(k.privateKey) };
}

before(async () => {
  await basePrueba();
  m = {
    db: await import("../../src/db"),
    calc: await import("../../src/lib/facturacion/calculo"),
    emi: await import("../../src/lib/facturacion/emision"),
    libros: await import("../../src/lib/facturacion/libros"),
    pdf: await import("../../src/lib/facturacion/pdf"),
    wsfe: await import("../../src/lib/arca/wsfe"),
    wsaa: await import("../../src/lib/arca/wsaa"),
    soap: await import("../../src/lib/arca/soap"),
    certs: await import("../../src/lib/arca/certificados"),
    config: await import("../../src/lib/config"),
    motor: await import("../../src/lib/ventas/motor"),
    medios: await import("../../src/lib/ventas/medios"),
    cajas: await import("../../src/lib/tesoreria/cajas"),
    prod: await import("../../src/lib/stock/productos"),
    cli: await import("../../src/lib/clientes/clientes"),
    gestion: await import("../../src/lib/cotizaciones/gestion"),
  };
  await m.gestion.cargarManual("USD_BLUE", 1000, 1050, true, "", A);
  await m.medios.cargarMediosIniciales();
  await m.cajas.cargarCajasIniciales();
  efectivo = (await m.medios.listarMedios()).find((x) => x.nombre === "Efectivo")!.id;
  await m.db.db.insert(m.db.puntosVenta).values({ numero: 3, nombre: "Local", porDefecto: true });
  await m.db.db.insert(m.db.usuarios).values({ id: 1, usuario: "admin", nombre: "Admin", rol: "admin", claveHash: "x" });
  await m.config.guardarConfig({ "negocio.cuit": "20111111112" }, A);
  cf = await m.cli.crearCliente({ nombre: "Consumidora", tipoDoc: "DNI", documento: "30111222", condicionIva: "consumidor_final" }, A);
  ri = await m.cli.crearCliente({ nombre: "Joyería Mayorista SA", tipoDoc: "CUIT", documento: "30714567892", condicionIva: "responsable_inscripto" }, A, { aunqueParezcaDuplicado: true });
});

test("letra, documento y cálculo del IVA hacia adentro (general, bienes usados, exento, C)", () => {
  const { calcularImportes, letraPara, documentoReceptor } = m.calc;
  assert.equal(letraPara("responsable_inscripto", { nombre: "x", tipoDoc: "CUIT", documento: "30714567892", condicionIva: "responsable_inscripto" }), "A");
  assert.equal(letraPara("responsable_inscripto", null), "B");
  assert.equal(letraPara("monotributo", { nombre: "x", tipoDoc: "CUIT", documento: "30714567892", condicionIva: "responsable_inscripto" }), "C");
  assert.deepEqual(documentoReceptor(null), { docTipo: 99, docNro: "0" });
  assert.deepEqual(documentoReceptor({ nombre: "x", tipoDoc: "DNI", documento: "30.111.222", condicionIva: "consumidor_final" }), { docTipo: 96, docNro: "30111222" });
  const g = calcularImportes([{ descripcion: "a", cantidad: 1, subtotal: 121000_00, ivaPct: 2100, tratamiento: "general", costo: 0 }], 121000_00, "B");
  assert.deepEqual([g.neto, g.iva, g.total], [100000_00, 21000_00, 121000_00]);
  // Descuento prorrateado: los ítems suman exacto el total.
  const d = calcularImportes([{ descripcion: "a", cantidad: 1, subtotal: 33333, ivaPct: 2100, tratamiento: "general", costo: 0 }, { descripcion: "b", cantidad: 1, subtotal: 66667, ivaPct: 1050, tratamiento: "general", costo: 0 }], 90001, "A");
  assert.equal(d.detalle.reduce((s, x) => s + x.subtotal, 0), 90001);
  assert.equal(d.neto + d.iva, 90001);
  assert.equal(d.ivas.length, 2);
  const u = calcularImportes([{ descripcion: "usado", cantidad: 1, subtotal: 100000_00, ivaPct: 2100, tratamiento: "bienes_usados", costo: 60000_00 }], 100000_00, "B");
  assert.equal(u.noGravado, 60000_00);
  assert.equal(u.neto, 33057_85);
  assert.equal(u.iva, 6942_15);
  const e = calcularImportes([{ descripcion: "x", cantidad: 1, subtotal: 5000, ivaPct: 2100, tratamiento: "exento", costo: 0 }], 5000, "B");
  assert.deepEqual([e.exento, e.iva], [5000, 0]);
  const c = calcularImportes([{ descripcion: "x", cantidad: 1, subtotal: 5000, ivaPct: 2100, tratamiento: "general", costo: 0 }], 5000, "C");
  assert.deepEqual([c.neto, c.iva, c.ivas.length], [5000, 0, 0]);
});

test("mensajes a ARCA: pedido de CAE y lectura de respuestas aprobadas y rechazadas", () => {
  const xml = m.wsfe.armarPedido({ puntoVenta: 3, tipo: 6, numero: 42, concepto: 1, docTipo: 96, docNro: "30111222", condicionIvaReceptor: 5, fecha: "20261119", total: 121000_00, noGravado: 0, neto: 100000_00, exento: 0, iva: 21000_00, ivas: [{ id: 5, base: 100000_00, importe: 21000_00 }] });
  for (const parte of ["<ar:CbteDesde>42</ar:CbteDesde>", "<ar:ImpTotal>121000.00</ar:ImpTotal>", "<ar:ImpNeto>100000.00</ar:ImpNeto>", "<ar:Id>5</ar:Id>", "<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>", "<ar:MonId>PES</ar:MonId>"]) assert.ok(xml.includes(parte), parte);
  assert.ok(!xml.includes("FchServDesde"));
  const ok = m.wsfe.leerRespuestaCae(m.soap.leerXml(`<soap:Envelope xmlns:soap="x"><soap:Body><FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>76123456789012</CAE><CAEFchVto>20261129</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>`));
  assert.deepEqual([ok.resultado, ok.cae, ok.caeVence], ["A", "76123456789012", "20261129"]);
  const mal = m.wsfe.leerRespuestaCae(m.soap.leerXml(`<Envelope><Body><R><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>DocNro invalido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></R></Body></Envelope>`));
  assert.equal(mal.resultado, "R");
  assert.equal(mal.cae, null);
  assert.deepEqual(mal.observaciones, ["10015: DocNro invalido"]);
});

test("certificado: genera la clave y el pedido con el CUIT; solo acepta el certificado de esa clave", () => {
  const csrPem = m.certs.generarPedido("homologacion", { cuit: "20-11111111-2", razonSocial: "María Castagno", alias: "mc" });
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  assert.ok(csr.verify());
  assert.equal(csr.subject.attributes.find((a) => a.type === "2.5.4.5")?.value, "CUIT 20111111112");
  const otro = certificadoDePrueba();
  assert.throws(() => m.certs.guardarCertificado("homologacion", otro.cert), /no corresponde/);
  // Certificado firmado para la clave generada (como haría ARCA).
  const clave = forge.pki.privateKeyFromPem(require("node:fs").readFileSync(path.join(process.env.ARCA_DIR!, "homologacion", "clave.key"), "utf8"));
  const c = forge.pki.createCertificate();
  c.publicKey = csr.publicKey!;
  c.serialNumber = "02";
  c.validity.notBefore = new Date(Date.now() - 86400_000);
  c.validity.notAfter = new Date(Date.now() + 700 * 86400_000);
  c.setSubject(csr.subject.attributes);
  c.setIssuer([{ name: "commonName", value: "Computadores Test" }]);
  c.sign(clave, forge.md.sha256.create());
  m.certs.guardarCertificado("homologacion", forge.pki.certificateToPem(c));
  const est = m.certs.estadoCertificado("homologacion");
  assert.equal(est.tieneCertificado, true);
  assert.equal("cuit" in est && est.cuit, "20111111112");
});

const hayOpenssl = require("node:child_process").spawnSync("openssl", ["version"]).status === 0;
test("firma del pedido de acceso (WSAA): CMS con el TRA adentro y el certificado", { skip: !hayOpenssl && "sin OpenSSL en este equipo" }, () => {
  const { cert, clave } = certificadoDePrueba();
  const tra = m.wsaa.armarTra("wsfe", new Date("2026-11-19T15:00:00Z"));
  assert.ok(tra.includes("<service>wsfe</service>"));
  const b64 = m.wsaa.firmarTra(tra, cert, clave);
  // Se verifica con OpenSSL (la firma es válida y el contenido es el TRA), igual que hace ARCA.
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const dir = mkdtempSync(path.join(tmpdir(), "mc-cms-"));
  writeFileSync(path.join(dir, "cms.der"), Buffer.from(b64, "base64"));
  writeFileSync(path.join(dir, "cert.pem"), cert);
  const contenido = execFileSync("openssl", ["cms", "-verify", "-inform", "DER", "-in", path.join(dir, "cms.der"), "-CAfile", path.join(dir, "cert.pem"), "-binary"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  assert.equal(contenido, tra);
});

test("modo simulado: la venta se factura sola (B a consumidor final, A a responsable inscripto) con numeración correlativa", async () => {
  const v1 = await vender(121000_00, cf);
  const f1 = await m.emi.facturarVenta(v1.id, A);
  assert.equal(f1.estado, "autorizado");
  assert.equal(f1.letra, "B");
  assert.equal(f1.tipo, 6);
  assert.equal(f1.puntoVenta, 3);
  assert.equal(f1.neto, 100000_00);
  assert.equal(f1.cae?.length, 14);
  const v2 = await vender(50000_00, null);
  const f2 = await m.emi.facturarVenta(v2.id, A);
  assert.equal(f2.numero, f1.numero! + 1);
  assert.equal(f2.docTipo, 99);
  const v3 = await vender(242000_00, ri);
  const f3 = await m.emi.facturarVenta(v3.id, A);
  assert.equal(f3.letra, "A");
  assert.equal(f3.numero, 1);
  await assert.rejects(m.emi.facturarVenta(v1.id, A), /ya tiene factura/);
  const venta = (await m.db.db.select().from(m.db.ventas).where((await import("drizzle-orm")).eq(m.db.ventas.id, v1.id)))[0];
  assert.equal(venta.estadoFiscal, "emitido");
  const pdf = await m.pdf.pdfComprobanteFiscal(f1.id);
  assert.ok(pdf && pdf.length > 2000);
});

test("consumidor final sin identificar: desde el tope hay que pedir el documento", async () => {
  await m.config.guardarConfig({ "fiscal.tope_sin_identificar": 100000_00 }, A);
  const v = await vender(150000_00, null);
  await assert.rejects(m.emi.facturarVenta(v.id, A), /identificar al comprador/);
  await m.config.guardarConfig({ "fiscal.tope_sin_identificar": 1_000_000_000 }, A);
});

test("anular una venta facturada exige nota de crédito; la nota la anula; la devolución parcial hace nota por lo devuelto", async () => {
  const { eq } = await import("drizzle-orm");
  const v = await vender(60500_00, cf);
  const f = await m.emi.facturarVenta(v.id, A);
  await assert.rejects(m.motor.anularVenta(v.id, "error de carga", A), /nota de crédito/);
  const nc = await m.emi.notaCredito({ facturaId: f.id, motivo: "error de carga", anular: true }, A);
  assert.equal(nc.estado, "autorizado");
  assert.equal(nc.tipo, 8);
  assert.equal(nc.total, f.total);
  assert.equal(nc.asociadoId, f.id);
  const venta = (await m.db.db.select().from(m.db.ventas).where(eq(m.db.ventas.id, v.id)))[0];
  assert.equal(venta.anulada, true);
  await assert.rejects(m.emi.notaCredito({ facturaId: f.id, importe: 1, motivo: "otra" }, A), /supera/);
  const v2 = await vender(121000_00, cf);
  const f2 = await m.emi.facturarVenta(v2.id, A);
  const parcial = await m.emi.notaCredito({ facturaId: f2.id, importe: 60500_00, motivo: "devolución parcial" }, A);
  assert.deepEqual([parcial.total, parcial.neto, parcial.iva], [60500_00, 50000_00, 10500_00]);
});

test("nota de débito a un cliente: suma a su cuenta corriente", async () => {
  const cobros = await import("../../src/lib/ventas/cobros");
  const antes = await cobros.saldoCliente(cf);
  const nd = await m.emi.notaDebito({ clienteId: cf, concepto: "Intereses por pago fuera de término", importe: 12100_00, ivaPct: 2100 }, A);
  assert.equal(nd.estado, "autorizado");
  assert.equal(nd.tipo, 7);
  assert.equal(await cobros.saldoCliente(cf), antes + 12100_00);
});

test("venta interna facturada después: no vuelve a mover stock ni caja", async () => {
  const { eq } = await import("drizzle-orm");
  const v = await vender(30000_00, cf, "interno");
  const movStock = await m.db.db.select().from(m.db.movimientosStock);
  const movCaja = await m.db.db.select().from(m.db.movimientosCaja);
  const f = await m.emi.facturarAPosteriori(v.id, A);
  assert.equal(f.estado, "autorizado");
  assert.equal((await m.db.db.select().from(m.db.movimientosStock)).length, movStock.length);
  assert.equal((await m.db.db.select().from(m.db.movimientosCaja)).length, movCaja.length);
  const venta = (await m.db.db.select().from(m.db.ventas).where(eq(m.db.ventas.id, v.id)))[0];
  assert.deepEqual([venta.tipoComprobante, venta.estadoFiscal], ["factura", "emitido"]);
  await assert.rejects(m.emi.facturarAPosteriori(v.id, A), /ya es con factura/);
});

test("homologación con ARCA simulado: pide el número, obtiene el CAE, no duplica si se pierde la respuesta y registra rechazos", async () => {
  const { cert, clave } = certificadoDePrueba();
  // Reemplaza el certificado de homologación por uno de prueba (con su clave).
  mkdirSync(path.join(process.env.ARCA_DIR!, "homologacion"), { recursive: true });
  writeFileSync(path.join(process.env.ARCA_DIR!, "homologacion", "clave.key"), clave);
  writeFileSync(path.join(process.env.ARCA_DIR!, "homologacion", "certificado.crt"), cert);
  await m.config.guardarConfig({ "arca.ambiente": "homologacion" }, A);
  const pedidos: string[] = [];
  let ultimo = 41;
  let modo: "ok" | "cortar" | "rechazar" = "ok";
  let autorizadoSinRespuesta: { numero: number; total: string; doc: string } | null = null;
  m.soap.usarTransporte(async (url, cuerpo, accion) => {
    pedidos.push(accion || url);
    if (url.includes("LoginCms")) {
      const ticket = `<loginTicketResponse><header><expirationTime>${new Date(Date.now() + 12 * 3600_000).toISOString()}</expirationTime></header><credentials><token>TOKEN</token><sign>FIRMA</sign></credentials></loginTicketResponse>`;
      return `<soapenv:Envelope xmlns:soapenv="x"><soapenv:Body><loginCmsResponse><loginCmsReturn>${ticket.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
    }
    assert.ok(cuerpo.includes("<ar:Token>TOKEN</ar:Token>") && cuerpo.includes("<ar:Cuit>20111111112</ar:Cuit>"));
    if (accion.endsWith("FECompUltimoAutorizado")) return `<Envelope><Body><R><CbteNro>${ultimo}</CbteNro></R></Body></Envelope>`;
    if (accion.endsWith("FECompConsultar")) {
      const n = Number(cuerpo.match(/<ar:CbteNro>(\d+)</)![1]);
      if (autorizadoSinRespuesta && n === autorizadoSinRespuesta.numero) return `<Envelope><Body><R><ResultGet><CodAutorizacion>76000000000099</CodAutorizacion><FchVto>20261130</FchVto><ImpTotal>${autorizadoSinRespuesta.total}</ImpTotal><DocNro>${autorizadoSinRespuesta.doc}</DocNro></ResultGet></R></Body></Envelope>`;
      return `<Envelope><Body><R><Errors><Err><Code>602</Code><Msg>No existen datos</Msg></Err></Errors></R></Body></Envelope>`;
    }
    if (accion.endsWith("FECAESolicitar")) {
      const n = Number(cuerpo.match(/<ar:CbteDesde>(\d+)</)![1]);
      if (modo === "cortar") {
        autorizadoSinRespuesta = { numero: n, total: cuerpo.match(/<ar:ImpTotal>([\d.]+)</)![1], doc: cuerpo.match(/<ar:DocNro>(\d+)</)![1] };
        ultimo = n;
        throw new Error("timeout");
      }
      if (modo === "rechazar") return `<Envelope><Body><R><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>Documento invalido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></R></Body></Envelope>`;
      ultimo = n;
      return `<Envelope><Body><R><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>7612345678901${n % 10}</CAE><CAEFchVto>20261129</CAEFchVto></FECAEDetResponse></FeDetResp></R></Body></Envelope>`;
    }
    throw new Error(`inesperado ${accion}`);
  });
  try {
    const v = await vender(121000_00, cf);
    const f = await m.emi.facturarVenta(v.id, A);
    assert.equal(f.estado, "autorizado");
    assert.equal(f.numero, 42);
    assert.equal(f.ambiente, "homologacion");
    assert.equal(pedidos.filter((p) => p.includes("LoginCms")).length, 1);
    // Se corta la conexión justo después de que ARCA autorizó: queda pendiente con su número…
    modo = "cortar";
    const v2 = await vender(50000_00, cf);
    const f2 = await m.emi.facturarVenta(v2.id, A);
    assert.equal(f2.estado, "pendiente");
    assert.equal(f2.numero, 43);
    await assert.rejects(m.motor.anularVenta(v2.id, "prueba", A), /a medio pedir/);
    // …y al reintentar se recupera el CAE consultando, sin pedir otro número.
    modo = "ok";
    const antes = pedidos.filter((p) => p.endsWith("FECAESolicitar")).length;
    const r = await m.emi.reintentarPendientes(A);
    assert.deepEqual(r, { pendientes: 1, autorizados: 1 });
    assert.equal(pedidos.filter((p) => p.endsWith("FECAESolicitar")).length, antes);
    // Rechazo: queda registrado con el motivo y sin número.
    modo = "rechazar";
    const v3 = await vender(20000_00, cf);
    const f3 = await m.emi.facturarVenta(v3.id, A);
    assert.equal(f3.estado, "rechazado");
    assert.equal(f3.numero, null);
    assert.match(f3.errores ?? "", /10015/);
    // Sin conexión: queda pendiente con el motivo y la venta sigue siendo válida.
    m.soap.usarTransporte(async () => {
      throw new Error("sin internet");
    });
    const v4 = await vender(20000_00, cf);
    const f4 = await m.emi.facturarVenta(v4.id, A);
    assert.equal(f4.estado, "pendiente");
    assert.match(f4.errores ?? "", /sin internet/);
  } finally {
    m.soap.usarTransporte(null);
    await m.config.guardarConfig({ "arca.ambiente": "simulado" }, A);
  }
});

test("libro IVA ventas: las notas de crédito restan", async () => {
  const filas = await m.libros.libroVentas(new Date(Date.now() - 86400_000), new Date(Date.now() + 86400_000));
  assert.ok(filas.some((f) => f.total < 0));
  const buf = await m.libros.excelLibroVentas(new Date(Date.now() - 86400_000), new Date(Date.now() + 86400_000), "prueba");
  assert.ok(buf.length > 1000);
});

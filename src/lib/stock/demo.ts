/**
 * Piezas de EJEMPLO para ver el sistema funcionando (marcadas con «es_demo»). Se cargan una sola vez.
 * Antes de usar el sistema en serio, el administrador las quita desde Configuración → Stock
 * («Quitar las piezas de ejemplo»): es lo único que se borra de verdad, porque no son datos del negocio.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  categorias,
  clienteDeseos,
  clientes,
  compraItems,
  compras,
  consignacionEntregadaItems,
  consignacionesEntregadas,
  db,
  historialPrecios,
  inventarioLecturas,
  leyesMetal,
  movimientosCcClientes,
  movimientosCcProveedores,
  movimientosMetal,
  movimientosStock,
  pagoImputaciones,
  pagosProveedores,
  productoFotos,
  productoPiedras,
  productos,
  proveedores,
  salidasPiezas,
  ubicaciones,
} from "@/db";
import { hoyIso } from "../formato";
import { auditar, SISTEMA, type Actor } from "../auditoria";
import { guardarConfig, leerUna } from "../config";
import { crearProducto, type DatosProducto } from "./productos";

type Demo = Partial<DatosProducto> & { nombre: string; cat: string; ley?: string; ubi: string };

const g = (gramos: number) => Math.round(gramos * 1000);
const $ = (pesos: number) => Math.round(pesos * 100);

const PIEZAS: Demo[] = [
  { nombre: "Anillo solitario con diamante", cat: "ANI", ley: "Oro 18k", ubi: "Vitrina principal", tipo: "unica", modoPrecio: "gramo", pesoBrutoMg: g(3.3), pesoNetoMg: g(3.1), talle: "14", hechura: $(180000), coleccion: "Clásica", costoMetal: $(280), costoManoObra: $(90), costoPiedras: $(150), monedaCosto: "USD", origen: "fabricacion", piedras: [{ tipo: "Diamante", cantidad: 1, quilates: 25, calidad: "G · VS2", certificado: "Ejemplo-0001" }], descripcion: "Solitario de seis garras, diamante talla brillante." },
  { nombre: "Par de alianzas clásicas 4 mm", cat: "ALI", ley: "Oro 18k", ubi: "Vitrina principal", tipo: "unica", modoPrecio: "gramo", pesoBrutoMg: g(8.4), pesoNetoMg: g(8.4), medidas: "4 mm", talle: "12 y 20", hechura: $(60000), costoMetal: $(760), costoManoObra: $(60), monedaCosto: "USD", origen: "compra", artesano: "Taller Ríos (ejemplo)" },
  { nombre: "Aros argolla lisa 2 cm", cat: "ARO", ley: "Oro 18k", ubi: "Vitrina 2", tipo: "unica", modoPrecio: "gramo", pesoBrutoMg: g(2.2), pesoNetoMg: g(2.2), medidas: "2 cm", hechura: $(25000), costoMetal: $(200), costoManoObra: $(20), monedaCosto: "USD", origen: "compra", artesano: "Taller Ríos (ejemplo)" },
  { nombre: "Aros abridores", cat: "ARO", ley: "Oro 10k (oro bajo)", ubi: "Exhibidor", tipo: "cantidad", cantidad: 12, stockMinimo: 5, modoPrecio: "gramo", pesoNetoMg: g(0.6), hechura: $(6000), costoMetal: $(22), costoManoObra: $(3), monedaCosto: "USD", origen: "compra" },
  { nombre: "Cadena forzada 45 cm", cat: "CAD", ley: "Plata 925", ubi: "Vitrina 2", tipo: "cantidad", cantidad: 15, stockMinimo: 4, modoPrecio: "gramo", pesoNetoMg: g(4.5), medidas: "45 cm", hechura: $(9000), costoMetal: $(9000), costoManoObra: $(2500), origen: "compra" },
  { nombre: "Cadena veneciana 50 cm", cat: "CAD", ley: "Oro 18k", ubi: "Caja fuerte", tipo: "unica", modoPrecio: "gramo", pesoBrutoMg: g(5.8), pesoNetoMg: g(5.8), medidas: "50 cm", hechura: $(40000), costoMetal: $(530), costoManoObra: $(35), monedaCosto: "USD", origen: "compra" },
  { nombre: "Anillo sello con iniciales", cat: "ANI", ley: "Oro 18k", ubi: "Caja fuerte", tipo: "unica", modoPrecio: "gramo", pesoBrutoMg: g(7.2), pesoNetoMg: g(7.2), talle: "22", hechura: $(70000), costoMetal: $(650), costoManoObra: $(80), monedaCosto: "USD", origen: "canje", descripcion: "Ingresó por canje de oro usado." },
  { nombre: "Dije medalla Virgen Niña", cat: "DIJ", ley: "Plata 925", ubi: "Exhibidor", tipo: "unica", modoPrecio: "fijo", precioLista: $(38000), pesoNetoMg: g(3), costoMetal: $(9000), costoManoObra: $(7000), origen: "compra", artesano: "Taller Ríos (ejemplo)" },
  { nombre: "Collar de perlas cultivadas 6 mm", cat: "COL", ubi: "Vitrina principal", tipo: "unica", modoPrecio: "fijo", precioLista: $(210000), metalDetalle: "Cierre de plata 925", medidas: "45 cm", origen: "consignacion", consignante: "Perlas del Sur (ejemplo)", costoPiedras: $(120000), piedras: [{ tipo: "Perla cultivada", cantidad: 62, quilates: null, calidad: "AA", certificado: null }] },
  { nombre: "Pulsera esclava con baño de oro", cat: "PUL", ubi: "Exhibidor", tipo: "unica", modoPrecio: "fijo", precioLista: $(95000), precioOferta: $(85000), metalDetalle: "Plata 925 con baño de oro", ley: "Plata 925", pesoNetoMg: g(11), costoMetal: $(25000), costoManoObra: $(18000), origen: "compra", coleccion: "Primavera" },
  { nombre: "Reloj automático acero 40 mm", cat: "REL", ubi: "Vitrina 2", tipo: "unica", modoPrecio: "fijo", precioLista: $(380), monedaPrecio: "USD", metalDetalle: "Acero inoxidable", costoOtros: $(240), monedaCosto: "USD", origen: "compra", ivaPct: 2100 },
  { nombre: "Estuche de pana para anillo", cat: "PAC", ubi: "Depósito", tipo: "packaging", cantidad: 40, stockMinimo: 20, modoPrecio: "fijo", precioLista: 0, costoOtros: $(1800), origen: "compra" },
  { nombre: "Bolsa de regalo con logo", cat: "PAC", ubi: "Depósito", tipo: "packaging", cantidad: 8, stockMinimo: 20, modoPrecio: "fijo", precioLista: 0, costoOtros: $(950), origen: "compra" },
];

export async function cargarDemo() {
  if (await leerUna("demo.cargado")) return 0;
  const [cats, leyes, ubis] = await Promise.all([db.select().from(categorias), db.select().from(leyesMetal), db.select().from(ubicaciones)]);
  let n = 0;
  for (const d of PIEZAS) {
    const { cat, ley, ubi, ...resto } = d;
    await crearProducto(
      {
        codigo: "",
        codigoBarras: null,
        tipo: "unica",
        categoriaId: cats.find((c) => c.prefijo === cat)?.id ?? null,
        leyId: ley ? (leyes.find((l) => l.nombre === ley)?.id ?? null) : null,
        ubicacionId: ubis.find((u) => u.nombre === ubi)?.id ?? null,
        pesoBrutoMg: null,
        pesoNetoMg: null,
        costoMetal: 0,
        costoManoObra: 0,
        costoPiedras: 0,
        costoOtros: 0,
        monedaCosto: "ARS",
        modoPrecio: "fijo",
        precioLista: 0,
        precioOferta: null,
        monedaPrecio: "ARS",
        hechura: 0,
        ivaPct: 2100,
        origen: "inventario",
        cantidad: 1,
        stockMinimo: 0,
        piedras: [],
        notasInternas: "Pieza de EJEMPLO para probar el sistema.",
        ...resto,
      },
      SISTEMA,
      { esDemo: true },
    );
    n++;
  }
  await guardarConfig({ "demo.cargado": true }, SISTEMA);
  return n;
}

/** Clientes y proveedores de ejemplo (módulo 4). Vincula las piezas de ejemplo con sus proveedores. */
export async function cargarDemoM4() {
  if (await leerUna("demo.cargado_m4")) return 0;
  const { crearProveedor } = await import("../proveedores/proveedores");
  const { crearCliente } = await import("../clientes/clientes");
  const prov = [
    { razonSocial: "Taller Ríos (ejemplo)", rubros: ["artesano", "taller"], contacto: "Martín Ríos", condicionIva: "monotributo", diasPago: 15, condicionesPago: "Contado o 15 días" },
    { razonSocial: "Perlas del Sur (ejemplo)", rubros: ["piedras"], contacto: "Clara", condicionIva: "responsable_inscripto", diasPago: 30, condicionesPago: "Consignación; se paga al vender" },
    { razonSocial: "Plata Fina Mayorista (ejemplo)", rubros: ["mayorista", "insumos"], contacto: "Ventas", condicionIva: "responsable_inscripto", diasPago: 30, condicionesPago: "30 días" },
    { razonSocial: "Ana Gómez, revendedora (ejemplo)", rubros: ["revendedor"], contacto: "Ana Gómez", condicionIva: "consumidor_final", diasPago: 0 },
  ] as const;
  const ids: number[] = [];
  for (const p of prov) ids.push(await crearProveedor({ ...p, rubros: [...p.rubros], cuit: null, nombreFantasia: null, telefono: null, whatsapp: null, email: null, domicilio: null, notas: "Proveedor de EJEMPLO para probar el sistema." }, SISTEMA, true));
  // Vincula las piezas de ejemplo con su proveedor (solo piezas de ejemplo).
  await db.update(productos).set({ proveedorId: ids[0] }).where(and(eq(productos.esDemo, true), eq(productos.artesano, "Taller Ríos (ejemplo)")));
  await db.update(productos).set({ proveedorId: ids[1] }).where(and(eq(productos.esDemo, true), eq(productos.consignante, "Perlas del Sur (ejemplo)")));
  await db.update(productos).set({ proveedorId: ids[2] }).where(and(eq(productos.esDemo, true), inArray(productos.tipo, ["cantidad", "packaging"])));

  // Fechas cercanas a hoy para que se vean los recordatorios.
  const hoy = hoyIso();
  const enDias = (d: number, anio: number) => `${anio}${new Date(Date.now() + d * 86400_000).toISOString().slice(4, 10)}`;
  const cli = [
    { nombre: "Laura Gómez (ejemplo)", whatsapp: "341 155 123456", cumpleanos: enDias(3, 1988), talles: "Anillo 14", preferencias: "Oro amarillo, piezas finas" },
    { nombre: "Carlos Benítez (ejemplo)", whatsapp: "11 15 4567 8901", aniversario: enDias(10, 2012), talles: "Anillo 22", preferencias: "Relojes" },
    { nombre: "Sofía Martínez (ejemplo)", whatsapp: "0341 15 678 9012", cumpleanos: enDias(25, 1995), preferencias: "Plata, aros pequeños" },
    { nombre: "Marcela Ruiz (ejemplo)", telefono: "341 456-7890", preferencias: "Alianzas, grabados" },
  ];
  for (const c of cli) await crearCliente({ condicionIva: "consumidor_final", tipoDoc: null, documento: null, ...c, notas: "Cliente de EJEMPLO para probar el sistema." }, SISTEMA, { aunqueParezcaDuplicado: true, esDemo: true });
  void hoy;
  await guardarConfig({ "demo.cargado_m4": true }, SISTEMA);
  return prov.length + cli.length;
}

/** Quita TODO lo de ejemplo (piezas, clientes, proveedores y lo que se haya cargado sobre ellos). No toca nada real. */
export async function quitarDemo(actor: Actor) {
  const ids = (await db.select({ id: productos.id }).from(productos).where(eq(productos.esDemo, true))).map((x) => x.id);
  const cli = (await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.esDemo, true))).map((x) => x.id);
  const prov = (await db.select({ id: proveedores.id }).from(proveedores).where(eq(proveedores.esDemo, true))).map((x) => x.id);
  if (!ids.length && !cli.length && !prov.length) return 0;
  const { limpiarVentasDemo } = await import("../ventas/demo");
  await db.transaction(async (tx) => {
    const ventasDemo = await limpiarVentasDemo(tx, ids, cli);
    const { cheques } = await import("@/db");
    if (cli.length) await tx.delete(cheques).where(inArray(cheques.clienteId, cli));
    if (prov.length) await tx.delete(cheques).where(inArray(cheques.proveedorId, prov));
    if (prov.length) {
      const comp = (await tx.select({ id: compras.id }).from(compras).where(inArray(compras.proveedorId, prov))).map((x) => x.id);
      const pagos = (await tx.select({ id: pagosProveedores.id }).from(pagosProveedores).where(inArray(pagosProveedores.proveedorId, prov))).map((x) => x.id);
      if (pagos.length) await tx.delete(pagoImputaciones).where(inArray(pagoImputaciones.pagoId, pagos));
      if (comp.length) {
        await tx.delete(pagoImputaciones).where(inArray(pagoImputaciones.compraId, comp));
        await tx.delete(compraItems).where(inArray(compraItems.compraId, comp));
        await tx.delete(movimientosMetal).where(inArray(movimientosMetal.compraId, comp));
      }
      await tx.delete(pagosProveedores).where(inArray(pagosProveedores.proveedorId, prov));
      await tx.delete(movimientosCcProveedores).where(inArray(movimientosCcProveedores.proveedorId, prov));
      if (comp.length) await tx.delete(compras).where(inArray(compras.id, comp));
      const ent = (await tx.select({ id: consignacionesEntregadas.id }).from(consignacionesEntregadas).where(inArray(consignacionesEntregadas.proveedorId, prov))).map((x) => x.id);
      if (ent.length) {
        await tx.delete(consignacionEntregadaItems).where(inArray(consignacionEntregadaItems.consignacionId, ent));
        await tx.delete(consignacionesEntregadas).where(inArray(consignacionesEntregadas.id, ent));
      }
      // Piezas reales que se hayan comprado a un proveedor de ejemplo: quedan sin proveedor.
      await tx.update(productos).set({ proveedorId: null }).where(inArray(productos.proveedorId, prov));
      await tx.delete(proveedores).where(inArray(proveedores.id, prov));
    }
    if (ids.length) {
      await tx.delete(consignacionEntregadaItems).where(inArray(consignacionEntregadaItems.productoId, ids));
      for (const t of [movimientosStock, historialPrecios, productoPiedras, productoFotos, salidasPiezas, inventarioLecturas]) await tx.delete(t).where(inArray(t.productoId, ids));
      await tx.update(clienteDeseos).set({ productoId: null }).where(inArray(clienteDeseos.productoId, ids));
      await tx.delete(productos).where(inArray(productos.id, ids));
    }
    if (cli.length) {
      await tx.delete(clienteDeseos).where(inArray(clienteDeseos.clienteId, cli));
      await tx.delete(movimientosCcClientes).where(inArray(movimientosCcClientes.clienteId, cli));
      await tx.delete(clientes).where(inArray(clientes.id, cli));
    }
    const { limpiarHuerfanosTesoreria } = await import("../tesoreria/avisos");
    await limpiarHuerfanosTesoreria(tx);
    await auditar(tx, actor, { accion: "anulacion", entidad: "producto", descripcion: `Quitó los datos de ejemplo: ${ids.length} piezas, ${cli.length} clientes y ${prov.length} proveedores${ventasDemo ? `, y ${ventasDemo} venta/s de prueba` : ""}` });
  });
  return ids.length + cli.length + prov.length;
}

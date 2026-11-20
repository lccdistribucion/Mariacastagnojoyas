/**
 * Datos iniciales y de prueba. Cada parte solo se carga si falta: se puede correr siempre sin pisar nada.
 * Usuarios de prueba (cambiar las claves antes de usar con datos reales):
 *   maria     / Castagno2026   → Administradora
 *   lucia     / Mostrador2026  → Usuario (vendedora)
 */
import { eq } from "drizzle-orm";
import { db, leyesMetal, usuarios } from "../src/db";
import { SISTEMA } from "../src/lib/auditoria";
import { guardarConfig, leerUna } from "../src/lib/config";
import { guardarLey, LEYES_INICIALES } from "../src/lib/cotizaciones/gestion";
import { crearUsuario } from "../src/lib/usuarios";
import { categorias, listasPrecios, puntosVenta, ubicaciones } from "../src/db";
import { CATEGORIAS_INICIALES, LISTAS_INICIALES, UBICACIONES_INICIALES } from "../src/lib/stock/catalogos";
import { cargarDemo, cargarDemoM4 } from "../src/lib/stock/demo";
import { cargarMediosIniciales } from "../src/lib/ventas/medios";
import { cargarDemoM5 } from "../src/lib/ventas/demo";
import { cargarCajasIniciales } from "../src/lib/tesoreria/cajas";

async function main() {
  if (!(await db.select({ id: usuarios.id }).from(usuarios)).length) {
    await crearUsuario({ usuario: "maria", nombre: "María Castagno", rol: "admin", descuentoMaxPct: null, comisionPct: 0, permisos: [] }, SISTEMA, "Castagno2026");
    await crearUsuario({ usuario: "lucia", nombre: "Lucía Fernández", rol: "usuario", descuentoMaxPct: null, comisionPct: 300, permisos: [] }, SISTEMA, "Mostrador2026");
    console.log("Usuarios de prueba creados: maria / Castagno2026 (admin) y lucia / Mostrador2026 (vendedora).");
  }
  if (!(await db.select({ id: leyesMetal.id }).from(leyesMetal)).length) {
    for (const l of LEYES_INICIALES) await guardarLey(null, l, SISTEMA);
    console.log(`Leyes de metal iniciales cargadas (${LEYES_INICIALES.length}).`);
  }
  if (!(await db.select({ id: categorias.id }).from(categorias)).length) {
    await db.insert(categorias).values(CATEGORIAS_INICIALES.map(([nombre, prefijo], i) => ({ nombre, prefijo, orden: i })));
    await db.insert(ubicaciones).values(UBICACIONES_INICIALES.map((nombre, i) => ({ nombre, orden: i })));
    await db.insert(listasPrecios).values(LISTAS_INICIALES.map((nombre, i) => ({ nombre, ajustePct: 0, orden: i })));
    console.log("Categorías, ubicaciones y listas de precios iniciales cargadas.");
  }
  if (!(await leerUna("cotizaciones.ley_oro_bajo"))) {
    const [bajo] = await db.select().from(leyesMetal).where(eq(leyesMetal.quilates, 10));
    if (bajo) await guardarConfig({ "cotizaciones.ley_oro_bajo": bajo.id }, SISTEMA);
  }
  await cargarMediosIniciales();
  if (!(await db.select({ id: puntosVenta.id }).from(puntosVenta)).length) {
    await db.insert(puntosVenta).values({ numero: 1, nombre: "Local (confirmar el número habilitado en ARCA)", porDefecto: true });
    console.log("Punto de venta de factura electrónica: 1 (a confirmar).");
  }
  const nc = await cargarCajasIniciales();
  if (nc) console.log(`Cajas iniciales creadas (${nc}) y vinculadas con los medios de cobro.`);
  if (process.env.SIN_DEMO !== "1") {
    const n = await cargarDemo();
    if (n) console.log(`Piezas de ejemplo cargadas: ${n} (se quitan desde Configuración → Stock).`);
    const m = await cargarDemoM4();
    if (m) console.log(`Clientes y proveedores de ejemplo cargados: ${m}.`);
    const r = await cargarDemoM5();
    if (r) console.log(`Reparaciones y pedidos de ejemplo cargados: ${r}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

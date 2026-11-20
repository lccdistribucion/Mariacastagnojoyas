/** Consulta cada fuente REAL de cotizaciones y muestra qué devolvió (no guarda nada). `npm run cotizaciones:probar` */
import { bcra } from "../src/lib/cotizaciones/conectores/bcra";
import { bluelytics } from "../src/lib/cotizaciones/conectores/bluelytics";
import { criptoya } from "../src/lib/cotizaciones/conectores/criptoya";
import { dolarapi } from "../src/lib/cotizaciones/conectores/dolarapi";
import { goldapi } from "../src/lib/cotizaciones/conectores/goldapi";
import { lecturaValida } from "../src/lib/cotizaciones/tipos";

async function main() {
for (const c of [dolarapi, criptoya, bluelytics, goldapi, bcra]) {
  const t = Date.now();
  try {
    const l = await c.obtener();
    console.log(`✓ ${c.nombre} (${Date.now() - t} ms)`);
    for (const x of l) console.log(`   ${lecturaValida(x) ? " " : "✗"} ${x.codigo.padEnd(14)} compra ${x.compra}  venta ${x.venta}  ${x.fechaFuente?.toISOString() ?? ""}`);
  } catch (e) {
    console.log(`✗ ${c.nombre}: ${e instanceof Error ? e.message : e}`);
  }
}
}
void main();

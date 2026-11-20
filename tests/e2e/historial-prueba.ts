/**
 * Historial para las pruebas automáticas. Con E2E_HISTORIAL_REAL=1 trae el historial público real
 * (BCRA y ArgentinaDatos); si no, carga una curva suave de 120 días marcada como fuente «prueba».
 * Solo se usa sobre la base de pruebas (data/e2e.db).
 */
import { cotizaciones, db } from "../../src/db";
import { importarHistorial } from "../../src/lib/cotizaciones/historial";
import { aMicro, type Codigo } from "../../src/lib/cotizaciones/tipos";

async function main() {
  if (process.env.E2E_HISTORIAL_REAL === "1") {
    const r = await importarHistorial(365);
    console.log(`Historial real: ${r.total} valores${r.errores.length ? ` (sin respuesta: ${r.errores.join("; ")})` : ""}`);
    return;
  }
  const base: Partial<Record<Codigo, number>> = { USD_BLUE: 1450, USD_OFICIAL: 1400, EUR_OFICIAL: 1580, XAU: 3500, XAG: 40 };
  const filas = [];
  for (let d = 120; d >= 1; d--) {
    const fecha = new Date(Date.now() - d * 86400_000);
    for (const [codigo, v] of Object.entries(base)) {
      const valor = v! * (1 + (120 - d) * 0.0008 + Math.sin(d / 9) * 0.01);
      filas.push({ codigo, compra: aMicro(valor * 0.98), venta: aMicro(valor), fuente: "prueba", origen: "historico", fecha });
    }
  }
  for (let i = 0; i < filas.length; i += 200) await db.insert(cotizaciones).values(filas.slice(i, i + 200));
  console.log(`Historial de prueba: ${filas.length} valores.`);
}
void main();

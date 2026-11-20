/** Trae el historial público de cotizaciones (por defecto, 365 días). `npm run cotizaciones:historial -- 730` */
import { importarHistorial } from "../src/lib/cotizaciones/historial";

async function main() {
const dias = Number(process.argv[2]) || 365;
const r = await importarHistorial(dias);
console.log(`Agregados ${r.total} valores diarios:`, r.agregados);
if (r.errores.length) console.log("Sin respuesta:", r.errores);
}
void main();

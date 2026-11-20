/**
 * Barra fija de cotizaciones: visible en todas las pantallas y para todos los usuarios.
 * Dólar (con selector de tipo), euro, onza de oro y gramo de oro 24k, 18k y bajo en pesos, cada uno con su
 * semáforo (verde: actualizado hoy; amarillo: desactualizado; rojo: falló y se usa el último valor).
 */
import { resumenCotizaciones } from "@/lib/cotizaciones/vigentes";
import { BarraCotizacionesCliente } from "./barra-cotizaciones-cliente";

export async function BarraCotizaciones({ puedeActualizar }: { puedeActualizar: boolean }) {
  const r = await resumenCotizaciones();
  return <BarraCotizacionesCliente r={r} puedeActualizar={puedeActualizar} />;
}

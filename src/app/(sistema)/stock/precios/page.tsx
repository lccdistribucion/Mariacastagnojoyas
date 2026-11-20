import { Aviso, Encabezado, Tarjeta } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { haceDias, serieDiaria } from "@/lib/cotizaciones/historial";
import { CODIGOS } from "@/lib/cotizaciones/tipos";
import { listarLeyes } from "@/lib/cotizaciones/vigentes";
import { numero } from "@/lib/formato";
import { listarCategorias } from "@/lib/stock/catalogos";
import { sugerencias } from "@/lib/stock/consultas";
import { Masivo } from "./masivo";

export const metadata = { title: "Actualizar precios" };

/** Variación de los últimos 30 días del oro y del dólar de referencia: sirve de referencia para el porcentaje. */
async function variaciones() {
  const ref = (await leerConfig(["cotizaciones.dolar_referencia"]))["cotizaciones.dolar_referencia"];
  const [oro, dolar] = await Promise.all([serieDiaria("XAU", haceDias(31)), serieDiaria(ref, haceDias(31))]);
  const v = (s: { valor: number }[]) => (s.length >= 2 ? (s[s.length - 1].valor / s[0].valor - 1) * 100 : null);
  const vo = v(oro);
  const vd = v(dolar);
  return { ref, vo, vd, gramo: vo != null && vd != null ? ((1 + vo / 100) * (1 + vd / 100) - 1) * 100 : null };
}

export default async function Precios() {
  await requierePermiso("modificar_precios");
  const [cats, leyes, sug, v] = await Promise.all([listarCategorias(), listarLeyes(true), sugerencias(), variaciones()]);
  const pct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${numero(x, 1)} %`);
  return (
    <>
      <Encabezado titulo="Actualizar precios" bajada="Sube o baja por porcentaje los precios fijos de un grupo de piezas. Primero se ve cómo quedan y recién después se aplica." />
      {v.gramo != null && (
        <div className="mb-5">
          <Aviso tono="champagne">
            En los últimos 30 días: onza de oro {pct(v.vo)}, {CODIGOS[v.ref].nombre.toLowerCase()} {pct(v.vd)} → el gramo de oro en pesos {pct(v.gramo)}. Es una referencia: el porcentaje lo decidís vos.
          </Aviso>
        </div>
      )}
      <Tarjeta className="p-4 sm:p-6">
        <Masivo
          categorias={cats.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre }))}
          leyes={leyes.map((l) => ({ id: l.id, nombre: l.nombre }))}
          artesanos={sug.artesanos}
          sugerido={null}
        />
      </Tarjeta>
    </>
  );
}

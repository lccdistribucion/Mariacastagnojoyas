/** Semáforo de una cotización: punto de color + texto (nunca solo color). */
import type { Estado } from "@/lib/cotizaciones/vigentes";

export const COLOR_ESTADO: Record<Estado, string> = {
  ok: "bg-ok",
  propia: "bg-champagne",
  desactualizada: "bg-[#d29a2b]",
  fallo: "bg-error",
  sin_dato: "bg-linea-fuerte",
};
export const TEXTO_ESTADO: Record<Estado, string> = {
  ok: "Al día",
  propia: "Propia",
  desactualizada: "Desactualizada",
  fallo: "Falló",
  sin_dato: "Sin datos",
};

export function Punto({ estado, className = "size-2" }: { estado: Estado; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${COLOR_ESTADO[estado]} ${className}`} aria-hidden />;
}

export function EstadoCotizacion({ estado }: { estado: Estado }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-tinta-suave">
      <Punto estado={estado} />
      {TEXTO_ESTADO[estado]}
    </span>
  );
}

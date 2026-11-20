/** Piezas visuales comunes. Botones y campos de al menos 44 px de alto (cómodos con el dedo). */
import Link from "next/link";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-tinta text-white hover:bg-tinta-suave",
  secundario: "border border-linea-fuerte bg-superficie text-tinta hover:border-tinta",
  fantasma: "text-tinta hover:bg-champagne-suave",
  peligro: "border border-error/30 bg-superficie text-error hover:bg-error-suave",
};
export function clasesBoton(v: Variante = "primario", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[v]} ${extra}`;
}

export function Boton({ variante = "primario", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button {...p} className={clasesBoton(variante, className)} />;
}

export function BotonLink({ variante = "primario", className = "", ...p }: React.ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link {...p} className={clasesBoton(variante, className)} />;
}

export function Encabezado({ titulo, bajada, acciones }: { titulo: string; bajada?: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="titulo-serif text-3xl leading-tight sm:text-4xl">{titulo}</h1>
        {bajada && <p className="mt-1 text-sm text-gris">{bajada}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function Tarjeta({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={`rounded-xl border border-linea bg-superficie shadow-suave ${className}`} />;
}

type Tono = "neutro" | "ok" | "alerta" | "error" | "champagne" | "oscuro";
const TONOS: Record<Tono, string> = {
  neutro: "bg-papel text-tinta-suave border-linea",
  ok: "bg-ok-suave text-ok border-ok/20",
  alerta: "bg-alerta-suave text-alerta border-alerta/20",
  error: "bg-error-suave text-error border-error/20",
  champagne: "bg-champagne-suave text-[#7a6340] border-champagne/30",
  oscuro: "bg-tinta text-white border-tinta",
};
export function Etiqueta({ tono = "neutro", children }: { tono?: Tono; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONOS[tono]}`}>{children}</span>;
}

export function Aviso({ tono = "neutro", children }: { tono?: Exclude<Tono, "oscuro" | "champagne"> | "champagne"; children: React.ReactNode }) {
  return <div role={tono === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${TONOS[tono]}`}>{children}</div>;
}

export function Campo({ etiqueta, ayuda, children, htmlFor }: { etiqueta: string; ayuda?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-tinta-suave">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="text-xs text-gris">{ayuda}</p>}
    </div>
  );
}

/** Mensaje para listas vacías. */
export function Vacio({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-12 text-center text-sm text-gris">{children}</div>;
}

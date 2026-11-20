"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/configuracion", etiqueta: "General y seguridad" },
  { href: "/configuracion/cotizaciones", etiqueta: "Cotizaciones y leyes" },
  { href: "/configuracion/stock", etiqueta: "Stock y etiquetas" },
  { href: "/configuracion/ventas", etiqueta: "Ventas y cobros" },
  { href: "/configuracion/mensajes", etiqueta: "Mensajes a clientes" },
];

export function Pestanas() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-linea" aria-label="Secciones de configuración">
      {PESTANAS.map((p) => {
        const on = path === p.href;
        return (
          <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined} className={`-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap ${on ? "border-tinta text-tinta" : "border-transparent text-gris hover:text-tinta"}`}>
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas de una sección. `exacta`: solo se marca si la ruta coincide justo (para la pestaña «inicio» de la sección). */
export function Pestanas({ items, etiqueta, ficha }: { items: { href: string; texto: string; exacta?: boolean }[]; etiqueta: string; ficha?: string }) {
  const path = usePathname();
  // Las fichas (/clientes/12) cuentan como la pestaña principal de la sección.
  const esFicha = (href: string) => new RegExp(`^${ficha ?? href}/\\d+`).test(path);
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-linea [scrollbar-width:none]" aria-label={etiqueta}>
      {items.map((p) => {
        const on = p.exacta ? path === p.href || esFicha(p.href) || path === `${p.href}/nuevo` || path === `${p.href}/nueva` : path === p.href || path.startsWith(`${p.href}/`);
        return (
          <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined} className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap ${on ? "border-tinta text-tinta" : "border-transparent text-gris hover:text-tinta"}`}>
            {p.texto}
          </Link>
        );
      })}
    </nav>
  );
}

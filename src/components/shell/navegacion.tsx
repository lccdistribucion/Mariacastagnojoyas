"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as I from "@/components/iconos";
import type { ItemMenu } from "./menu";

const ICONOS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  inicio: I.IconoInicio,
  mostrador: I.IconoMostrador,
  ventas: I.IconoVentas,
  caja: I.IconoCaja,
  anillo: I.IconoAnillo,
  clientes: I.IconoClientes,
  taller: I.IconoTaller,
  proveedores: I.IconoProveedores,
  tesoreria: I.IconoTesoreria,
  factura: I.IconoFactura,
  informes: I.IconoInformes,
  usuarios: I.IconoUsuarios,
  auditoria: I.IconoAuditoria,
  ajustes: I.IconoAjustes,
  cotizaciones: I.IconoCotizaciones,
  alertas: I.IconoCampana,
};

function activo(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function ListaMenu({ principal, admin, alNavegar }: { principal: ItemMenu[]; admin: ItemMenu[]; alNavegar?: () => void }) {
  const path = usePathname();
  const item = (it: ItemMenu) => {
    const Icono = ICONOS[it.icono];
    if (it.proximo)
      return (
        <li key={it.href}>
          <span className="flex min-h-11 cursor-default items-center gap-3 rounded-lg px-3 text-sm text-white/35" title={`Llega en el módulo ${it.proximo}`}>
            <Icono className="size-[18px]" />
            <span className="flex-1">{it.etiqueta}</span>
            <span className="rounded border border-white/15 px-1.5 text-[0.65rem] tracking-wide">M{it.proximo}</span>
          </span>
        </li>
      );
    const on = activo(path, it.href);
    return (
      <li key={it.href}>
        <Link
          href={it.href}
          onClick={alNavegar}
          aria-current={on ? "page" : undefined}
          className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${on ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white"}`}
        >
          {on && <span className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-champagne" />}
          <Icono className="size-[18px]" />
          <span className="flex-1">{it.etiqueta}</span>
          {!!it.contador && <span className="min-w-5 rounded-full bg-champagne px-1.5 text-center text-[0.7rem] leading-5 font-semibold text-tinta">{it.contador}</span>}
        </Link>
      </li>
    );
  };
  return (
    <nav className="flex flex-col gap-6" aria-label="Menú principal">
      <ul className="flex flex-col gap-0.5">{principal.map(item)}</ul>
      {admin.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-[0.65rem] uppercase tracking-[0.25em] text-white/40">Administración</p>
          <ul className="flex flex-col gap-0.5">{admin.map(item)}</ul>
        </div>
      )}
    </nav>
  );
}

import Image from "next/image";
import Link from "next/link";
import { BarraCotizaciones } from "@/components/shell/barra-cotizaciones";
import { CajonMovil } from "@/components/shell/cajon-movil";
import { ControlInactividad } from "@/components/shell/inactividad";
import { MENU_ADMIN, MENU_PRINCIPAL } from "@/components/shell/menu";
import { ListaMenu } from "@/components/shell/navegacion";
import { IconoSalir } from "@/components/iconos";
import { alertasSinLeer } from "@/lib/alertas";
import { requiereUsuario } from "@/lib/auth/sesion";
import { IconoCampana } from "@/components/iconos";
import { ROLES } from "@/lib/permisos";

/** Marco de todas las pantallas internas: menú, barra de cotizaciones y control de inactividad. */
export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const u = await requiereUsuario();
  const filtrar = (lista: typeof MENU_PRINCIPAL) => lista.filter((i) => !i.permiso || u.permisos.has(i.permiso));
  const principal = filtrar(MENU_PRINCIPAL);
  const veAvisos = u.permisos.has("modificar_cotizaciones");
  const sinLeer = veAvisos ? await alertasSinLeer() : 0;
  const admin = filtrar(MENU_ADMIN).map((i) => (i.href === "/alertas" ? { ...i, contador: sinLeer } : i));
  const iniciales = u.nombre.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const pieUsuario = (
    <div className="mt-4 border-t border-white/10 pt-4">
      <Link href="/cambiar-clave" className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5">
        <span className="flex size-9 items-center justify-center rounded-full border border-champagne/50 text-xs font-semibold tracking-wider text-champagne">{iniciales}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-white">{u.nombre}</span>
          <span className="block text-xs text-white/50">{ROLES[u.rol]}</span>
        </span>
      </Link>
      <form action="/salir" method="post">
        <button className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-white/70 hover:bg-white/5 hover:text-white">
          <IconoSalir className="size-[18px]" /> Salir
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menú lateral (computadora y tablet horizontal) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-tinta px-3 pb-4 lg:flex">
        <Link href="/" className="flex h-20 items-center px-3" aria-label="Inicio">
          <Image src="/logo-blanco.png" alt="María Castagno" width={377} height={48} priority className="h-auto w-44" />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <ListaMenu principal={principal} admin={admin} />
        </div>
        {pieUsuario}
      </aside>

      {/* Encabezado del celular */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-tinta px-4 lg:hidden">
        <CajonMovil principal={principal} admin={admin} pie={pieUsuario} />
        <Link href="/" aria-label="Inicio">
          <Image src="/logo-blanco.png" alt="María Castagno" width={377} height={48} priority className="h-auto w-36" />
        </Link>
        <div className="flex items-center gap-1">
          {veAvisos && (
            <Link href="/alertas" className="relative flex size-10 items-center justify-center text-white" aria-label={`Avisos${sinLeer ? `: ${sinLeer} sin leer` : ""}`}>
              <IconoCampana className="size-5" />
              {sinLeer > 0 && <span className="absolute top-1 right-0.5 min-w-4 rounded-full bg-champagne px-1 text-center text-[0.6rem] leading-4 font-bold text-tinta">{sinLeer}</span>}
            </Link>
          )}
          <Link href="/cambiar-clave" className="flex size-9 items-center justify-center rounded-full border border-champagne/50 text-xs font-semibold text-champagne" aria-label="Mi cuenta">
            {iniciales}
          </Link>
        </div>
      </header>

      <BarraCotizaciones puedeActualizar={u.permisos.has("modificar_cotizaciones")} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      <ControlInactividad minutos={u.inactividadMinutos} />
    </div>
  );
}

"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { IconoCerrar, IconoMenu } from "@/components/iconos";
import type { ItemMenu } from "./menu";
import { ListaMenu } from "./navegacion";

/** Menú del celular: botón ☰ que abre un panel lateral. */
export function CajonMovil({ principal, admin, pie }: { principal: ItemMenu[]; admin: ItemMenu[]; pie: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto]);
  return (
    <>
      <button onClick={() => setAbierto(true)} className="-ml-2 flex size-11 items-center justify-center text-white" aria-label="Abrir menú">
        <IconoMenu className="size-6" />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAbierto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-tinta px-3 pb-4">
            <div className="flex h-14 items-center justify-between pl-3">
              <Image src="/logo-blanco.png" alt="María Castagno" width={377} height={48} className="h-auto w-36" />
              <button onClick={() => setAbierto(false)} className="flex size-11 items-center justify-center text-white" aria-label="Cerrar menú">
                <IconoCerrar className="size-6" />
              </button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto">
              <ListaMenu principal={principal} admin={admin} alNavegar={() => setAbierto(false)} />
            </div>
            {pie}
          </div>
        </div>
      )}
    </>
  );
}

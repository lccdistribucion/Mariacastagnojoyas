import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/ui";
import { usuarioActual } from "@/lib/auth/sesion";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

const MOTIVOS: Record<string, string> = {
  inactividad: "Tu sesión se cerró por inactividad. Volvé a ingresar.",
  salida: "Cerraste la sesión.",
};

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  if (await usuarioActual()) redirect("/");
  const { motivo } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex items-center justify-center overflow-hidden bg-tinta px-6 py-12 lg:py-0">
        {/* Brillo sutil, como el reflejo del metal */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgb(255_255_255/0.07),transparent_60%)]" />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <Image src="/logo-blanco.png" alt="María Castagno" width={377} height={48} priority className="h-auto w-56 sm:w-72 lg:w-96" />
          <div className="h-px w-16 bg-champagne/70" />
          <p className="text-[0.7rem] uppercase tracking-[0.35em] text-white/60">Joyería · Sistema de gestión</p>
        </div>
      </section>
      <section className="flex items-start justify-center px-5 py-10 sm:items-center sm:px-8">
        <div className="w-full max-w-sm">
          <h1 className="titulo-serif text-4xl">Bienvenida</h1>
          <p className="mt-1 mb-8 text-sm text-gris">Ingresá con tu usuario y tu clave.</p>
          {motivo && MOTIVOS[motivo] && (
            <div className="mb-6">
              <Aviso tono={motivo === "inactividad" ? "alerta" : "neutro"}>{MOTIVOS[motivo]}</Aviso>
            </div>
          )}
          <FormularioIngreso />
          <p className="mt-10 text-xs leading-relaxed text-gris">
            ¿Te olvidaste la clave? Pedile al administrador que la reinicie desde <span className="text-tinta-suave">Usuarios</span>.
          </p>
        </div>
      </section>
    </main>
  );
}

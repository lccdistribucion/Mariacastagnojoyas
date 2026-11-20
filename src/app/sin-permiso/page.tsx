import { BotonLink } from "@/components/ui";
import { IconoCandado } from "@/components/iconos";

export const metadata = { title: "Sin permiso" };

export default function SinPermiso() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <IconoCandado className="mx-auto size-10 text-champagne" />
        <h1 className="titulo-serif mt-4 text-3xl">Sin permiso</h1>
        <p className="mt-2 text-sm text-gris">Esta sección es solo para el administrador. Si la necesitás, pedile que te dé el permiso.</p>
        <BotonLink href="/" className="mt-6">Volver al inicio</BotonLink>
      </div>
    </main>
  );
}

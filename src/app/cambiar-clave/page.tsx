import Image from "next/image";
import Link from "next/link";
import { Aviso } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { FormularioClave } from "./formulario";

export const metadata = { title: "Cambiar clave" };

export default async function CambiarClave() {
  const u = await requiereUsuario({ permitirCambioPendiente: true });
  return (
    <main className="min-h-dvh">
      <header className="flex h-16 items-center justify-center bg-tinta">
        <Image src="/logo-blanco.png" alt="María Castagno" width={377} height={48} className="h-auto w-40" />
      </header>
      <div className="mx-auto max-w-sm px-5 py-10">
        <h1 className="titulo-serif text-3xl">Cambiar tu clave</h1>
        <p className="mt-1 mb-6 text-sm text-gris">{u.nombre}</p>
        {u.debeCambiarClave && (
          <div className="mb-6">
            <Aviso tono="alerta">Estás usando una clave temporal. Elegí tu clave personal para seguir.</Aviso>
          </div>
        )}
        <FormularioClave />
        {!u.debeCambiarClave && (
          <Link href="/" className="mt-6 block text-center text-sm text-gris underline-offset-4 hover:underline">Volver sin cambiar</Link>
        )}
      </div>
    </main>
  );
}

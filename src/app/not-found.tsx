import { BotonLink } from "@/components/ui";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="text-center">
        <p className="titulo-serif text-6xl text-champagne">404</p>
        <h1 className="titulo-serif mt-2 text-3xl">No encontramos esta página</h1>
        <BotonLink href="/" className="mt-6">Volver al inicio</BotonLink>
      </div>
    </main>
  );
}

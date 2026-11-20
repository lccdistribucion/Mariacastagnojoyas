import { Encabezado } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { FormularioCliente } from "../formulario";

export const metadata = { title: "Nuevo cliente" };

export default async function NuevoCliente({ searchParams }: { searchParams: Promise<{ nombre?: string }> }) {
  await requiereUsuario();
  const { nombre } = await searchParams;
  return (
    <>
      <Encabezado titulo="Nuevo cliente" bajada="Solo el nombre es obligatorio. El resto se puede completar después." />
      <FormularioCliente inicial={{ nombre: nombre ?? "" }} />
    </>
  );
}

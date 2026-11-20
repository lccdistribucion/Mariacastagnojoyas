import { notFound } from "next/navigation";
import { Encabezado } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { obtenerCliente } from "@/lib/clientes/clientes";
import { FormularioCliente } from "../../formulario";

export const metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }: { params: Promise<{ id: string }> }) {
  await requiereUsuario();
  const c = await obtenerCliente(Number((await params).id));
  if (!c) notFound();
  return (
    <>
      <Encabezado titulo={`Editar ${c.nombre}`} />
      <FormularioCliente inicial={c} />
    </>
  );
}

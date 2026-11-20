import { notFound } from "next/navigation";
import { Encabezado } from "@/components/ui";
import { obtenerProveedor } from "@/lib/proveedores/proveedores";
import { FormularioProveedor } from "../../formulario";

export const metadata = { title: "Editar proveedor" };
export default async function EditarProveedor({ params }: { params: Promise<{ id: string }> }) {
  const p = await obtenerProveedor(Number((await params).id));
  if (!p) notFound();
  return (
    <>
      <Encabezado titulo={`Editar ${p.razonSocial}`} />
      <FormularioProveedor inicial={p} />
    </>
  );
}

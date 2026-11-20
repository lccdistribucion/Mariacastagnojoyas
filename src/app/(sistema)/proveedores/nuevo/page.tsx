import { Encabezado } from "@/components/ui";
import { FormularioProveedor } from "../formulario";

export const metadata = { title: "Nuevo proveedor" };
export default function NuevoProveedor() {
  return (
    <>
      <Encabezado titulo="Nuevo proveedor" bajada="Fabricantes, mayoristas, artesanos, talleres, y también revendedores a los que les dejás piezas." />
      <FormularioProveedor />
    </>
  );
}

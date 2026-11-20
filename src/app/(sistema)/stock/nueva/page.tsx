import { Encabezado } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { datosFormulario } from "../datos-formulario";
import { FormularioPieza } from "../formulario-pieza";

export const metadata = { title: "Nueva pieza" };

export default async function NuevaPieza() {
  const u = await requierePermiso("cargar_productos");
  return (
    <>
      <Encabezado titulo="Nueva pieza" bajada="Después de guardarla vas a poder agregarle fotos e imprimir la etiqueta." />
      <FormularioPieza {...await datosFormulario(u.permisos.has("ver_proveedores"))} verCostos={u.permisos.has("ver_costos")} puedePrecios />
    </>
  );
}

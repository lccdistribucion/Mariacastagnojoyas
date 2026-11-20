import { Encabezado, Tarjeta } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { leerUna } from "@/lib/config";
import { FormularioUsuario } from "../formulario";

export const metadata = { title: "Nuevo usuario" };

export default async function NuevoUsuario() {
  await requierePermiso("gestionar_usuarios");
  return (
    <>
      <Encabezado titulo="Nuevo usuario" bajada="El sistema genera una clave temporal; la persona elige la suya al primer ingreso." />
      <Tarjeta className="p-5 sm:p-7">
        <FormularioUsuario descuentoGeneral={await leerUna("ventas.descuento_max_pct")} />
      </Tarjeta>
    </>
  );
}

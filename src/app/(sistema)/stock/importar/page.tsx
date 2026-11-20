import { clasesBoton, Encabezado, Tarjeta } from "@/components/ui";
import { IconoExcel } from "@/components/iconos";
import { requierePermiso } from "@/lib/auth/sesion";
import { FormularioImportar } from "./formulario";

export const metadata = { title: "Importar piezas" };

export default async function Importar() {
  await requierePermiso("cargar_productos");
  return (
    <>
      <Encabezado
        titulo="Importar piezas"
        bajada="Para cargar el inventario inicial desde una planilla. Primero se revisa fila por fila; después se cargan juntas las válidas."
        acciones={<a href="/stock/importar/plantilla" className={clasesBoton("secundario")}><IconoExcel className="size-4" /> Bajar la plantilla</a>}
      />
      <Tarjeta className="p-4 sm:p-6"><FormularioImportar /></Tarjeta>
      <p className="mt-4 text-sm text-gris">Pesos en gramos con coma (3,25). Precios en la moneda que indiques. Si tu planilla tiene otras columnas, pasámela y armo el importador a su medida.</p>
    </>
  );
}

import { notFound, redirect } from "next/navigation";
import { Encabezado } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { obtenerProducto } from "@/lib/stock/productos";
import { datosFormulario } from "../../datos-formulario";
import { FormularioPieza } from "../../formulario-pieza";

export const metadata = { title: "Editar pieza" };

export default async function EditarPieza({ params }: { params: Promise<{ id: string }> }) {
  const u = await requierePermiso("cargar_productos");
  const p = await obtenerProducto(Number((await params).id));
  if (!p) notFound();
  if (p.estado === "vendido" || p.estado === "baja") redirect(`/stock/${p.id}`);
  const verCostos = u.permisos.has("ver_costos");
  return (
    <>
      <Encabezado titulo={`Editar ${p.codigo}`} bajada={p.nombre} />
      <FormularioPieza
        {...await datosFormulario(u.permisos.has("ver_proveedores"))}
        verCostos={verCostos}
        puedePrecios={u.permisos.has("modificar_precios")}
        inicial={{
          ...p,
          ...(verCostos ? {} : { costoMetal: 0, costoManoObra: 0, costoPiedras: 0, costoOtros: 0 }),
          piedras: p.piedras.map((x) => ({ tipo: x.tipo, cantidad: x.cantidad, quilates: x.quilates, calidad: x.calidad, certificado: x.certificado })),
        }}
      />
    </>
  );
}

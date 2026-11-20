import { Encabezado } from "@/components/ui";
import { obtenerVigentes, listarLeyes } from "@/lib/cotizaciones/vigentes";
import { leerConfig } from "@/lib/config";
import { opcionesProveedores } from "@/lib/proveedores/proveedores";
import { listarCategorias, listarUbicaciones } from "@/lib/stock/catalogos";
import { listarCajas } from "@/lib/tesoreria/cajas";
import { FormularioCompra } from "./formulario";

export const metadata = { title: "Cargar compra" };

export default async function NuevaCompra({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  const { proveedor } = await searchParams;
  const [provs, cats, leyes, ubis, vig, cfg, cajas] = await Promise.all([opcionesProveedores(), listarCategorias(), listarLeyes(true), listarUbicaciones(), obtenerVigentes(), leerConfig(["cotizaciones.dolar_referencia"]), listarCajas()]);
  return (
    <>
      <Encabezado titulo="Cargar compra" bajada="Todo junto: el stock, el costo, el metal y la deuda con el proveedor se actualizan al guardar." />
      <FormularioCompra
        proveedores={provs}
        proveedorInicial={Number(proveedor) || null}
        categorias={cats.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre }))}
        leyes={leyes.map((l) => ({ id: l.id, nombre: l.nombre }))}
        ubicaciones={ubis.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))}
        cot={{ USD: vig[cfg["cotizaciones.dolar_referencia"]].venta, EUR: vig.EUR_OFICIAL.venta }}
        cajas={cajas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda, tipo: c.tipo }))}
      />
    </>
  );
}

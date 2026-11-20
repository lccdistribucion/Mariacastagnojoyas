import { Tarjeta } from "@/components/ui";
import { leerConfig } from "@/lib/config";
import { listarMedios, TIPOS_MEDIO } from "@/lib/ventas/medios";
import { listarCajas } from "@/lib/tesoreria/cajas";
import { FilaMedio, FilaPlan, FormDatosVentas } from "./formularios";

export const metadata = { title: "Configuración de ventas" };

export default async function ConfigVentas() {
  const [medios, cajasL, c] = await Promise.all([
    listarMedios(false),
    listarCajas(false),
    leerConfig(["negocio.direccion", "negocio.telefono", "negocio.cuit", "negocio.web", "ventas.garantia_meses", "ventas.garantia_texto", "ventas.vale_meses", "reservas.dias", "presupuestos.validez_dias", "reparaciones.dias_abandono", "reparaciones.condiciones"]),
  ]);
  const cajas = cajasL.filter((x) => x.activa).map((x) => ({ id: x.id, nombre: x.nombre, moneda: x.moneda }));
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-5 sm:p-6">
        <h2 className="font-medium">Medios de cobro</h2>
        <p className="mt-1 mb-4 text-sm text-gris">Recargo (+) o descuento (−) sobre lo que se paga con cada medio, y la caja o cuenta donde entra lo cobrado (Tesorería). Los recargos arrancan en 0 %: definilos vos. Los que no uses, desactivalos.</p>
        <div className="flex flex-col gap-4">
          {medios.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 border-b border-linea pb-4 last:border-0">
              <FilaMedio tipos={TIPOS_MEDIO} cajas={cajas} m={{ id: m.id, nombre: m.nombre, tipo: m.tipo, moneda: m.moneda, ajustePct: m.ajustePct, activo: m.activo, orden: m.orden, cajaId: m.cajaId }} />
              {m.tipo === "credito" && (
                <div className="ml-0 flex flex-col gap-2 rounded-lg bg-papel/60 p-3 sm:ml-6">
                  <p className="text-xs text-gris">Planes de cuotas (el recargo se suma al del medio)</p>
                  {m.planes.map((p) => <FilaPlan key={p.id} medioId={m.id} p={{ id: p.id, cuotas: p.cuotas, recargoPct: p.recargoPct, activo: p.activo }} />)}
                  <FilaPlan medioId={m.id} />
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-linea pt-4"><p className="mb-2 text-sm font-medium">Agregar medio</p><FilaMedio tipos={TIPOS_MEDIO} cajas={cajas} /></div>
        </div>
      </Tarjeta>
      <Tarjeta className="p-5 sm:p-6">
        <h2 className="font-medium">Datos de los comprobantes y plazos</h2>
        <p className="mt-1 mb-4 text-sm text-gris">Aparecen en el encabezado de los PDF (comprobante, garantía, presupuesto, recepción de reparación y pedido).</p>
        <FormDatosVentas
          v={{
            direccion: c["negocio.direccion"],
            telefono: c["negocio.telefono"],
            cuit: c["negocio.cuit"],
            web: c["negocio.web"],
            garantia: c["ventas.garantia_meses"],
            garantiaTexto: c["ventas.garantia_texto"],
            valeMeses: c["ventas.vale_meses"],
            reservaDias: c["reservas.dias"],
            presupuestoDias: c["presupuestos.validez_dias"],
            abandono: c["reparaciones.dias_abandono"],
            condiciones: c["reparaciones.condiciones"],
          }}
        />
      </Tarjeta>
    </div>
  );
}

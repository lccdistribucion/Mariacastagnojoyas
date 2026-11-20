import { Tarjeta } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { estadoCertificado } from "@/lib/arca/certificados";
import { listarPuntosVenta } from "@/lib/facturacion/puntos";
import { FilaPuntoVenta, FormDatosFiscales, PanelCertificado } from "./formularios";

export const metadata = { title: "Configuración ARCA" };

export default async function ConfigArca() {
  await requierePermiso("configurar_sistema");
  const [c, pvs] = await Promise.all([
    leerConfig(["fiscal.condicion_iva", "fiscal.razon_social", "negocio.cuit", "fiscal.iibb", "fiscal.inicio_actividades", "fiscal.tope_sin_identificar", "fiscal.emitir_al_vender", "arca.ambiente"]),
    listarPuntosVenta(),
  ]);
  const certs = (["homologacion", "produccion"] as const).map((a) => {
    const e = estadoCertificado(a);
    return { ambiente: a, tieneClave: e.tieneClave, tieneCertificado: e.tieneCertificado, vence: "vence" in e && e.vence ? e.vence.toLocaleDateString("es-AR") : null, cuit: "cuit" in e ? (e.cuit ?? null) : null };
  });
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-5 sm:p-6">
        <h2 className="font-medium">Datos fiscales y conexión</h2>
        <p className="mt-1 mb-4 text-sm text-gris">Confirmalos con el contador. «Simulado» permite usar todo el circuito sin ARCA (comprobantes sin validez). «Homologación» es el ambiente de prueba de ARCA; «Producción», el real.</p>
        <FormDatosFiscales v={{ condicion: c["fiscal.condicion_iva"], razonSocial: c["fiscal.razon_social"], cuit: c["negocio.cuit"], iibb: c["fiscal.iibb"], inicio: c["fiscal.inicio_actividades"], tope: c["fiscal.tope_sin_identificar"], alVender: c["fiscal.emitir_al_vender"], ambiente: c["arca.ambiente"] }} />
      </Tarjeta>
      <Tarjeta className="p-5 sm:p-6">
        <h2 className="font-medium">Puntos de venta</h2>
        <p className="mt-1 mb-4 text-sm text-gris">El número tiene que coincidir con un punto de venta dado de alta en ARCA como «Factura electrónica — Web services». El marcado «por defecto» es el que usa el mostrador.</p>
        <div className="flex flex-col gap-3">
          {pvs.map((p) => <FilaPuntoVenta key={p.id} p={p} />)}
          <div className="border-t border-linea pt-3"><FilaPuntoVenta /></div>
        </div>
      </Tarjeta>
      <div className="grid gap-6 xl:grid-cols-2">
        {certs.map((x) => (
          <Tarjeta key={x.ambiente} className="p-5 sm:p-6">
            <PanelCertificado {...x} />
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}

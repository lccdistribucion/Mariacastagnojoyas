import { notFound } from "next/navigation";
import { Aviso, clasesBoton, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { fecha, fechaHora, numero } from "@/lib/formato";
import { opcionesProveedores } from "@/lib/proveedores/proveedores";
import { listarAdjuntos } from "@/lib/taller/adjuntos";
import { enlaceAvisoReparacion, ESTADOS_REPARACION, obtenerReparacion, PASOS, TRABAJOS, type EstadoReparacion } from "@/lib/taller/reparaciones";
import { senaDisponible } from "@/lib/ventas/cobros";
import { GaleriaTaller } from "../fotos";
import { TONO_REP } from "../vista";
import { AvisoWhatsapp, PanelEstado, PanelImporte } from "./paneles";

export const metadata = { title: "Reparación" };
const $ = (c: number) => `$ ${numero(c / 100, 0)}`;
const g = (mg: number) => `${numero(mg / 1000, 2)} g`;

export default async function FichaReparacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const u = await requiereUsuario();
  const r = await obtenerReparacion(Number((await params).id));
  if (!r) notFound();
  const { aviso } = await searchParams;
  const [fotos, talleres, sena, wa] = await Promise.all([listarAdjuntos("reparacion", r.id), opcionesProveedores(["taller"]), senaDisponible(`reparacion:${r.id}`), enlaceAvisoReparacion(r.id)]);
  const abierta = !["entregada", "abandonada"].includes(r.estado);
  const dato = (t: string, v: React.ReactNode) => (v ? <div className="flex justify-between gap-4 border-b border-linea py-2 text-sm last:border-0"><dt className="text-gris">{t}</dt><dd className="text-right">{v}</dd></div> : null);
  void u;
  return (
    <>
      <Encabezado
        titulo={`Reparación N.º ${r.numero}`}
        bajada={<span className="flex flex-wrap items-center gap-2">{r.cliente.nombre} <Etiqueta tono={TONO_REP[r.estado]}>{ESTADOS_REPARACION[r.estado as EstadoReparacion]}</Etiqueta></span>}
        acciones={<a href={`/documentos/reparacion/${r.id}`} target="_blank" className={clasesBoton("secundario")}>Comprobante de recepción</a>}
      />
      {aviso === "creada" && <div className="mb-5"><Aviso tono="ok">Reparación registrada. Imprimí el comprobante para que lo firme el cliente.</Aviso></div>}
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <Tarjeta className="px-5 py-2">
            <dl>
              {dato("Pieza", r.descripcion)}
              {dato("Trabajo", r.trabajos.map((t) => TRABAJOS[t]).join(", "))}
              {dato("Detalle", r.detalle)}
              {dato("Peso al ingreso", r.pesoIngresoMg != null && g(r.pesoIngresoMg))}
              {dato("Ingresó", fecha(r.fechaIngreso))}
              {dato("Prometida", r.fechaPrometida && fecha(r.fechaPrometida))}
              {dato("Taller", r.taller)}
              {dato("Costo del taller", r.costoTaller != null && $(r.costoTaller))}
              {dato("A cobrar", r.presupuesto != null ? $(r.presupuesto) : "Sin definir")}
              {dato("Seña disponible", sena > 0 && $(sena))}
            </dl>
          </Tarjeta>
          <Tarjeta className="p-5">
            <h2 className="mb-3 font-medium">Fotos</h2>
            <GaleriaTaller entidad="reparacion" id={r.id} fotos={fotos.map((f) => f.archivo)} />
          </Tarjeta>
          <Tarjeta>
            <h2 className="border-b border-linea px-5 py-3 font-medium">Historial</h2>
            <ul className="divide-y divide-linea">
              {r.historial.map((h) => (
                <li key={h.id} className="px-5 py-2.5 text-sm">
                  <span className="font-medium">{ESTADOS_REPARACION[h.estado as EstadoReparacion] ?? h.estado}</span>
                  {h.nota ? ` · ${h.nota}` : ""}
                  <span className="block text-xs text-gris">{fechaHora(h.fecha)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
        <div className="flex flex-col gap-5">
          {abierta && ["lista", "avisada"].includes(r.estado) && (
            <a href={`/mostrador?servicio=reparacion:${r.id}`} className={clasesBoton("primario", "w-full text-base")}>Cobrar y entregar</a>
          )}
          {abierta && ["lista", "avisada"].includes(r.estado) && (wa ? <AvisoWhatsapp id={r.id} href={wa} /> : <p className="text-sm text-gris">El cliente no tiene WhatsApp cargado para avisarle.</p>)}
          {abierta && (
            <Tarjeta className="p-5">
              <h2 className="mb-3 font-medium">Cambiar estado</h2>
              <PanelEstado id={r.id} pasos={PASOS[r.estado].map((k) => ({ k, t: ESTADOS_REPARACION[k] }))} talleres={talleres} tallerActual={r.proveedorId} />
            </Tarjeta>
          )}
          {abierta && (
            <Tarjeta className="p-5">
              <h2 className="mb-3 font-medium">Importe a cobrar</h2>
              <PanelImporte id={r.id} actual={r.presupuesto} />
            </Tarjeta>
          )}
          {r.estado === "entregada" && r.ventaId && <a href={`/ventas/${r.ventaId}`} className={clasesBoton("secundario")}>Ver la venta de la entrega</a>}
        </div>
      </div>
    </>
  );
}

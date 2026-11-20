"use client";
import { useActionState, useState, useTransition } from "react";
import { enviar } from "@/components/envio";
import { Aviso, Boton, Campo, Etiqueta } from "@/components/ui";
import { accionDatosFiscales, accionGenerarPedido, accionProbarConexion, accionPuntoVenta, accionSubirCertificado, type Estado } from "../acciones";

function R({ e }: { e: Estado }) {
  if (e?.error) return <Aviso tono="error">{e.error}</Aviso>;
  if (e?.aviso) return <Aviso tono="alerta">{e.aviso}</Aviso>;
  if (e?.ok) return <Aviso tono="ok">{e.ok}</Aviso>;
  return null;
}

type Datos = { condicion: string; razonSocial: string; cuit: string; iibb: string; inicio: string; tope: number; alVender: boolean; ambiente: string };

export function FormDatosFiscales({ v }: { v: Datos }) {
  const [e, accion, enviando] = useActionState(accionDatosFiscales, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Condición frente al IVA" htmlFor="fCond" ayuda="Responsable inscripto emite A y B; Monotributo emite C.">
          <select id="fCond" name="condicion" className="campo" defaultValue={v.condicion}><option value="responsable_inscripto">Responsable inscripto</option><option value="monotributo">Monotributo</option></select>
        </Campo>
        <Campo etiqueta="Conexión con ARCA" htmlFor="fAmb">
          <select id="fAmb" name="ambiente" className="campo" defaultValue={v.ambiente}><option value="simulado">Simulado (sin ARCA, para probar)</option><option value="homologacion">Homologación (prueba de ARCA)</option><option value="produccion">Producción (facturas reales)</option></select>
        </Campo>
        <Campo etiqueta="Razón social" htmlFor="fRs"><input id="fRs" name="razonSocial" className="campo" defaultValue={v.razonSocial} /></Campo>
        <Campo etiqueta="CUIT" htmlFor="fCuit"><input id="fCuit" name="cuit" className="campo" inputMode="numeric" defaultValue={v.cuit} /></Campo>
        <Campo etiqueta="Ingresos Brutos N.º" htmlFor="fIibb"><input id="fIibb" name="iibb" className="campo" defaultValue={v.iibb} /></Campo>
        <Campo etiqueta="Inicio de actividades" htmlFor="fIni"><input id="fIni" name="inicio" className="campo" placeholder="dd/mm/aaaa" defaultValue={v.inicio} /></Campo>
        <Campo etiqueta="Identificar al comprador desde ($)" htmlFor="fTope" ayuda="Factura B a consumidor final: desde este importe se pide DNI o CUIT. Valor a confirmar con el contador.">
          <input id="fTope" name="tope" className="campo" inputMode="decimal" defaultValue={String(v.tope / 100).replace(".", ",")} />
        </Campo>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="alVender" value="1" defaultChecked={v.alVender} className="size-5" /> Pedir el CAE apenas se confirma la venta</label>
      </div>
      <R e={e} />
      <div><Boton disabled={enviando}>Guardar</Boton></div>
    </form>
  );
}

export function FilaPuntoVenta({ p }: { p?: { id: number; numero: number; nombre: string; activo: boolean; porDefecto: boolean } }) {
  const [e, accion, enviando] = useActionState(accionPuntoVenta, undefined);
  return (
    <form onSubmit={enviar(accion)} className="flex flex-col gap-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-[6rem_1fr] gap-2 sm:grid-cols-[6rem_1fr_auto_auto_auto] sm:items-center">
        <input name="numero" className="campo" inputMode="numeric" defaultValue={p?.numero} placeholder="N.º" aria-label="Número de punto de venta" required />
        <input name="nombre" className="campo" defaultValue={p?.nombre} placeholder="Nombre (ej.: Local)" aria-label="Nombre del punto de venta" required />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activo" value="1" defaultChecked={p?.activo ?? true} className="size-4" /> Activo</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="porDefecto" value="1" defaultChecked={p?.porDefecto ?? false} className="size-4" /> Por defecto</label>
        <Boton variante="secundario" disabled={enviando}>{p ? "Guardar" : "Agregar"}</Boton>
      </div>
      <R e={e} />
    </form>
  );
}

export function PanelCertificado({ ambiente, tieneClave, tieneCertificado, vence, cuit }: { ambiente: "homologacion" | "produccion"; tieneClave: boolean; tieneCertificado: boolean; vence: string | null; cuit: string | null }) {
  const [alias, setAlias] = useState("mariacastagno");
  const [gen, setGen] = useState<Estado>(undefined);
  const [generando, iniciar] = useTransition();
  const [eSubir, subir, subiendo] = useActionState(accionSubirCertificado, undefined);
  const [eProbar, probar, probando] = useActionState(accionProbarConexion, undefined);
  const nombre = ambiente === "produccion" ? "Producción" : "Homologación (prueba)";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Certificado · {nombre}</h2>
        {tieneCertificado ? <Etiqueta tono="ok">Cargado · vence {vence}</Etiqueta> : tieneClave ? <Etiqueta tono="alerta">Falta el certificado</Etiqueta> : <Etiqueta>Sin configurar</Etiqueta>}
      </div>
      {tieneCertificado && cuit && <p className="text-xs text-gris">Certificado para el CUIT {cuit}.</p>}
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          Generá el pedido de certificado (se crea la clave privada, que queda guardada solo en esta computadora).
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="campo w-48" value={alias} onChange={(e) => setAlias(e.target.value)} aria-label="Alias del certificado" />
            <Boton type="button" variante="secundario" disabled={generando} onClick={() => iniciar(async () => {
              const r = await accionGenerarPedido(ambiente, alias);
              if ("error" in r && r.error) return setGen({ error: r.error });
              const url = URL.createObjectURL(new Blob([(r as { csr: string }).csr], { type: "application/pkcs10" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `pedido-${ambiente}.csr`;
              a.click();
              URL.revokeObjectURL(url);
              setGen({ ok: "Se descargó el pedido (.csr). Ahora subilo en ARCA." });
            })}>{generando ? "Generando…" : "Generar pedido (.csr)"}</Boton>
          </div>
          {tieneCertificado && <p className="mt-1 text-xs text-alerta">Ojo: generar otro pedido reemplaza la clave y el certificado actual deja de servir hasta cargar el nuevo.</p>}
          <div className="mt-2"><R e={gen} /></div>
        </li>
        <li>
          {ambiente === "produccion"
            ? "En ARCA, con clave fiscal: «Administración de Certificados Digitales» → agregar alias → subir el .csr → descargar el certificado. Después, en «Administrador de Relaciones», autorizar el servicio «Facturación electrónica» para ese certificado."
            : "En ARCA, con clave fiscal: servicio «WSASS – Autogestión Certificados Homologación» → nuevo certificado → pegar el contenido del .csr → descargar el certificado. Después, en el mismo WSASS, crear la autorización para el servicio «wsfe»."}
        </li>
        <li>
          Cargá acá el certificado que te dio ARCA:
          <form onSubmit={enviar(subir)} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="ambiente" value={ambiente} />
            <input type="file" name="certificado" accept=".crt,.pem,.cer" className="campo flex-1 py-2" aria-label={`Certificado de ${nombre}`} />
            <Boton variante="secundario" disabled={subiendo}>Cargar certificado</Boton>
          </form>
          <div className="mt-2"><R e={eSubir} /></div>
        </li>
        <li>
          Probá la conexión:
          <form action={probar} className="mt-2">
            <input type="hidden" name="ambiente" value={ambiente} />
            <Boton variante="secundario" disabled={probando || !tieneCertificado}>{probando ? "Conectando…" : "Probar conexión con ARCA"}</Boton>
          </form>
          <div className="mt-2"><R e={eProbar} /></div>
        </li>
      </ol>
    </div>
  );
}

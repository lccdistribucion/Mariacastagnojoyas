import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, or } from "drizzle-orm";
import { Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { auditoria, db } from "@/db";
import { requierePermiso } from "@/lib/auth/sesion";
import { leerUna } from "@/lib/config";
import { fechaHora } from "@/lib/formato";
import { obtenerUsuario } from "@/lib/usuarios";
import { FormularioUsuario } from "../formulario";
import { PanelAcciones } from "./acciones-panel";

export const metadata = { title: "Editar usuario" };

export default async function EditarUsuario({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requierePermiso("gestionar_usuarios");
  const id = Number((await params).id);
  const u = Number.isInteger(id) ? await obtenerUsuario(id) : null;
  if (!u) notFound();
  const historial = await db
    .select()
    .from(auditoria)
    .where(or(eq(auditoria.usuarioId, id), and(eq(auditoria.entidad, "usuario"), eq(auditoria.entidadId, String(id)))))
    .orderBy(desc(auditoria.fecha))
    .limit(12);

  return (
    <>
      <Encabezado
        titulo={u.nombre}
        bajada={
          <span className="flex flex-wrap items-center gap-2">
            @{u.usuario} · Último ingreso: {u.ultimoIngreso ? fechaHora(u.ultimoIngreso) : "nunca"}
            {!u.activo && <Etiqueta>Desactivado</Etiqueta>}
            {u.bloqueadoMin > 0 && <Etiqueta tono="error">Bloqueado {u.bloqueadoMin} min</Etiqueta>}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Tarjeta className="p-5 sm:p-7">
          <FormularioUsuario
            inicial={{ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, descuentoMaxPct: u.descuentoMaxPct, comisionPct: u.comisionPct, permisos: u.permisos }}
            descuentoGeneral={await leerUna("ventas.descuento_max_pct")}
            esUnoMismo={u.id === yo.id}
          />
        </Tarjeta>
        <div className="flex flex-col gap-6">
          <Tarjeta className="p-5">
            <h2 className="mb-4 font-medium">Acciones</h2>
            <PanelAcciones id={u.id} activo={u.activo} bloqueado={u.bloqueadoMin > 0} esUnoMismo={u.id === yo.id} />
          </Tarjeta>
          <Tarjeta>
            <div className="flex items-center justify-between border-b border-linea px-5 py-4">
              <h2 className="font-medium">Actividad</h2>
              <Link href={`/auditoria?usuarioId=${u.id}`} className="text-sm text-gris hover:text-tinta">Ver todo</Link>
            </div>
            <ul className="divide-y divide-linea">
              {historial.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <p className="text-sm">{e.descripcion}</p>
                  <p className="text-xs text-gris">{fechaHora(e.fecha)}{e.usuarioId !== u.id ? ` · por ${e.usuarioNombre}` : ""}</p>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

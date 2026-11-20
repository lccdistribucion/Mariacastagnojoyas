import Link from "next/link";
import { BotonLink, Encabezado, Etiqueta, Tarjeta } from "@/components/ui";
import { IconoFlecha, IconoMas } from "@/components/iconos";
import { requierePermiso } from "@/lib/auth/sesion";
import { fechaHora } from "@/lib/formato";
import { ROLES } from "@/lib/permisos";
import { listarUsuarios } from "@/lib/usuarios";

export const metadata = { title: "Usuarios" };

function Estado({ u }: { u: Awaited<ReturnType<typeof listarUsuarios>>[number] }) {
  if (!u.activo) return <Etiqueta>Desactivado</Etiqueta>;
  if (u.bloqueadoMin) return <Etiqueta tono="error">Bloqueado {u.bloqueadoMin} min</Etiqueta>;
  if (u.debeCambiarClave) return <Etiqueta tono="alerta">Clave temporal</Etiqueta>;
  return <Etiqueta tono="ok">Activo</Etiqueta>;
}

export default async function Usuarios() {
  await requierePermiso("gestionar_usuarios");
  const lista = await listarUsuarios();
  return (
    <>
      <Encabezado
        titulo="Usuarios"
        bajada="Quién puede entrar al sistema y qué puede hacer. Los usuarios no se borran: se desactivan."
        acciones={<BotonLink href="/usuarios/nuevo"><IconoMas className="size-4" /> Nuevo usuario</BotonLink>}
      />
      <Tarjeta>
        {/* Celular: tarjetas */}
        <ul className="divide-y divide-linea md:hidden">
          {lista.map((u) => (
            <li key={u.id}>
              <Link href={`/usuarios/${u.id}`} className={`flex items-center gap-3 px-4 py-4 ${u.activo ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.nombre}</p>
                  <p className="text-xs text-gris">@{u.usuario} · {ROLES[u.rol]}</p>
                  <div className="mt-2"><Estado u={u} /></div>
                </div>
                <IconoFlecha className="size-4 text-gris" />
              </Link>
            </li>
          ))}
        </ul>
        {/* Computadora: tabla */}
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-gris">
              <th className="px-5 py-3 font-medium">Nombre</th>
              <th className="px-5 py-3 font-medium">Usuario</th>
              <th className="px-5 py-3 font-medium">Rol</th>
              <th className="px-5 py-3 font-medium">Estado</th>
              <th className="px-5 py-3 font-medium">Último ingreso</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {lista.map((u) => (
              <tr key={u.id} className={`hover:bg-papel/60 ${u.activo ? "" : "text-gris"}`}>
                <td className="px-5 py-3.5 font-medium"><Link href={`/usuarios/${u.id}`}>{u.nombre}</Link></td>
                <td className="px-5 py-3.5 text-tinta-suave">@{u.usuario}</td>
                <td className="px-5 py-3.5">{ROLES[u.rol]}</td>
                <td className="px-5 py-3.5"><Estado u={u} /></td>
                <td className="px-5 py-3.5 text-tinta-suave">{u.ultimoIngreso ? fechaHora(u.ultimoIngreso) : "Nunca"}</td>
                <td className="px-5 py-3.5 text-right">
                  <Link href={`/usuarios/${u.id}`} className="text-gris hover:text-tinta">Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </>
  );
}

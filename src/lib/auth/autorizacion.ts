/**
 * Autorización con clave del administrador: cuando un vendedor necesita hacer algo fuera de su límite
 * (un descuento mayor, anular, ajustar stock), un administrador escribe su usuario y clave en el mismo equipo.
 * Queda registrado quién autorizó, a quién y para qué. La usan los módulos de Ventas y Stock.
 */
import { eq } from "drizzle-orm";
import { db, usuarios } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { verificarClave } from "./clave";
import { claveUsuario, mensajeBloqueo, minutosBloqueado, registrarFallo, limpiarFallos } from "./intentos";

export async function autorizarConAdmin(
  solicitante: Actor,
  admin: { usuario: string; clave: string },
  motivo: string,
): Promise<{ ok: true; adminId: number; adminNombre: string } | { ok: false; error: string }> {
  const usuario = admin.usuario.trim().toLowerCase();
  const bloqueo = await minutosBloqueado(claveUsuario(usuario));
  if (bloqueo) return { ok: false, error: mensajeBloqueo(bloqueo) };
  const [a] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
  const valido = !!a && a.activo && a.rol === "admin" && (await verificarClave(admin.clave, a.claveHash));
  await db.transaction(async (tx) => {
    await auditar(tx, solicitante, {
      accion: valido ? "autorizacion" : "autorizacion_rechazada",
      entidad: "usuario",
      entidadId: a?.id ?? null,
      descripcion: valido
        ? `${a!.nombre} autorizó a ${solicitante.nombre}: ${motivo}`
        : `Autorización rechazada (usuario «${usuario}»): ${motivo}`,
    });
  });
  if (!valido) {
    const r = await registrarFallo(claveUsuario(usuario));
    return { ok: false, error: r.bloqueo ? mensajeBloqueo(r.bloqueo) : "Usuario o clave de administrador incorrectos." };
  }
  await limpiarFallos(claveUsuario(usuario));
  return { ok: true, adminId: a!.id, adminNombre: a!.nombre };
}

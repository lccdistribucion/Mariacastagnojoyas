/**
 * Ingreso, validación y cierre de sesiones. Esta capa no conoce cookies (la usa `sesion.ts`) para poder
 * probarla sola. El token va en la cookie; en la base solo se guarda su hash SHA-256.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, permisosUsuario, sesiones, usuarios } from "@/db";
import { auditar } from "../auditoria";
import { leerConfig } from "../config";
import { permisosEfectivos, type Permiso, type Rol } from "../permisos";
import { hashFalso_, verificarClave } from "./clave";
import { claveIp, claveUsuario, limpiarFallos, mensajeBloqueo, minutosBloqueado, registrarFallo } from "./intentos";

export type UsuarioSesion = {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  debeCambiarClave: boolean;
  permisos: Set<Permiso>;
  descuentoMaxPct: number | null;
  sesionId: string;
  inactividadMinutos: number;
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const normalizar = (u: string) => u.trim().toLowerCase();

type Contexto = { ip?: string | null; dispositivo?: string | null; ahora?: number };

export async function intentarIngreso(usuarioTxt: string, clave: string, ctx: Contexto = {}) {
  const ahora = ctx.ahora ?? Date.now();
  const usuario = normalizar(usuarioTxt);
  const ip = ctx.ip ?? "desconocida";
  const actorAnonimo = { id: null, nombre: usuario || "(vacío)", ip };

  if (!usuario || !clave) return { ok: false as const, error: "Completá usuario y clave." };

  const bloqueo = Math.max(await minutosBloqueado(claveUsuario(usuario), ahora), await minutosBloqueado(claveIp(ip), ahora));
  if (bloqueo) return { ok: false as const, error: mensajeBloqueo(bloqueo) };

  const [fila] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
  const claveOk = await verificarClave(clave, fila?.claveHash ?? (await hashFalso_()));

  if (!fila || !claveOk || !fila.activo) {
    const rUsuario = await registrarFallo(claveUsuario(usuario), ahora);
    const rEquipo = await registrarFallo(claveIp(ip), ahora, 3);
    const r = { bloqueo: Math.max(rUsuario.bloqueo, rEquipo.bloqueo), restantes: rUsuario.restantes };
    await db.transaction(async (tx) => {
      await auditar(tx, fila ? { id: fila.id, nombre: fila.nombre, ip } : actorAnonimo, {
        accion: r.bloqueo ? "bloqueo" : "ingreso_fallido",
        entidad: "sesion",
        entidadId: fila?.id ?? null,
        descripcion: r.bloqueo
          ? rEquipo.bloqueo
            ? `Equipo ${ip} bloqueado ${r.bloqueo} min por muchos intentos fallidos (último usuario probado: «${usuario}»)`
            : `Ingreso bloqueado ${r.bloqueo} min por intentos fallidos (usuario «${usuario}»)`
          : fila && !fila.activo && claveOk
            ? `Intento de ingreso de un usuario desactivado («${usuario}»)`
            : `Clave o usuario incorrectos («${usuario}»)`,
      });
    });
    if (r.bloqueo) return { ok: false as const, error: mensajeBloqueo(r.bloqueo) };
    if (fila && !fila.activo && claveOk)
      return { ok: false as const, error: "Este usuario está desactivado. Consultá con el administrador." };
    return {
      ok: false as const,
      error:
        r.restantes <= 2
          ? `Usuario o clave incorrectos. Te ${r.restantes === 1 ? "queda 1 intento" : `quedan ${r.restantes} intentos`} antes del bloqueo.`
          : "Usuario o clave incorrectos.",
    };
  }

  await limpiarFallos(claveUsuario(usuario));
  await limpiarFallos(claveIp(ip));

  const cfg = await leerConfig(["seguridad.sesion_horas"]);
  const token = randomBytes(32).toString("base64url");
  const id = hashToken(token);
  await db.transaction(async (tx) => {
    await tx.insert(sesiones).values({
      id,
      usuarioId: fila.id,
      version: fila.versionSesion,
      creadaEn: new Date(ahora),
      ultimaActividad: new Date(ahora),
      expiraEn: new Date(ahora + cfg["seguridad.sesion_horas"] * 3600_000),
      ip,
      dispositivo: (ctx.dispositivo ?? "").slice(0, 200) || null,
    });
    await tx.update(usuarios).set({ ultimoIngreso: new Date(ahora) }).where(eq(usuarios.id, fila.id));
    await auditar(tx, { id: fila.id, nombre: fila.nombre, ip }, {
      accion: "ingreso",
      entidad: "sesion",
      entidadId: fila.id,
      descripcion: `Ingresó al sistema`,
    });
  });
  return { ok: true as const, token, maxAgeSeg: cfg["seguridad.sesion_horas"] * 3600, debeCambiarClave: fila.debeCambiarClave };
}

/**
 * Valida el token de la cookie. Cierra la sesión si venció, si pasó el tiempo de inactividad,
 * si el usuario fue desactivado o si cambió su clave. Registra actividad (como mucho una vez por minuto).
 */
export async function validarSesion(token: string | undefined, ahora = Date.now()): Promise<UsuarioSesion | null> {
  if (!token) return null;
  const id = hashToken(token);
  const [s] = await db.select().from(sesiones).where(and(eq(sesiones.id, id), isNull(sesiones.cerradaEn)));
  if (!s) return null;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, s.usuarioId));
  const cfg = await leerConfig(["seguridad.inactividad_minutos"]);
  const inactividad = cfg["seguridad.inactividad_minutos"];

  let motivo: string | null = null;
  if (!u || !u.activo) motivo = "usuario desactivado";
  else if (u.versionSesion !== s.version) motivo = "clave cambiada";
  else if (s.expiraEn.getTime() <= ahora) motivo = "vencida";
  else if (ahora - s.ultimaActividad.getTime() > inactividad * 60000) motivo = "inactividad";
  if (motivo) {
    await db.update(sesiones).set({ cerradaEn: new Date(ahora), motivoCierre: motivo }).where(eq(sesiones.id, id));
    return null;
  }

  if (ahora - s.ultimaActividad.getTime() > 60_000)
    await db.update(sesiones).set({ ultimaActividad: new Date(ahora) }).where(eq(sesiones.id, id));

  const excepciones = await db.select().from(permisosUsuario).where(eq(permisosUsuario.usuarioId, u!.id));
  return {
    id: u!.id,
    usuario: u!.usuario,
    nombre: u!.nombre,
    rol: u!.rol,
    debeCambiarClave: u!.debeCambiarClave,
    permisos: permisosEfectivos(u!.rol, excepciones),
    descuentoMaxPct: u!.descuentoMaxPct,
    sesionId: id,
    inactividadMinutos: inactividad,
  };
}

/** Cierra la sesión (salida manual o por inactividad detectada en el navegador). */
export async function cerrarSesion(token: string | undefined, motivo: "salida" | "inactividad", ip?: string | null) {
  if (!token) return;
  const id = hashToken(token);
  const [s] = await db.select().from(sesiones).where(and(eq(sesiones.id, id), isNull(sesiones.cerradaEn)));
  if (!s) return;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, s.usuarioId));
  await db.transaction(async (tx) => {
    await tx.update(sesiones).set({ cerradaEn: new Date(), motivoCierre: motivo }).where(eq(sesiones.id, id));
    await auditar(tx, { id: s.usuarioId, nombre: u?.nombre ?? "?", ip }, {
      accion: "salida",
      entidad: "sesion",
      entidadId: s.usuarioId,
      descripcion: motivo === "inactividad" ? "Sesión cerrada por inactividad" : "Cerró la sesión",
    });
  });
}

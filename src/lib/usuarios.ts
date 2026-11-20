/**
 * Alta, edición, desactivación y claves de usuarios. Todas las operaciones van en una transacción con su
 * registro de auditoría. Reglas: nunca se borra un usuario (se desactiva), nadie se desactiva a sí mismo y
 * siempre queda al menos un administrador activo.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, permisosUsuario, sesiones, usuarios, type Tx } from "@/db";
import { auditar, diferencias, type Actor } from "./auditoria";
import { claveTemporal, hashClave, problemaClave, verificarClave } from "./auth/clave";
import { claveUsuario, limpiarFallos, minutosBloqueado } from "./auth/intentos";
import { ErrorValidacion } from "./config";
import { PERMISOS, PERMISOS_DELEGABLES, ROLES, type Permiso, type Rol } from "./permisos";

const esquemaUsuario = z.object({
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, "El usuario va en minúsculas, sin espacios ni acentos (3 a 30 letras o números)."),
  nombre: z.string().trim().min(2, "Escribí el nombre completo.").max(80),
  rol: z.enum(["admin", "usuario"]),
  descuentoMaxPct: z.number().int().min(0).max(10000).nullable(),
  comisionPct: z.number().int().min(0).max(10000),
  permisos: z.array(z.string()).default([]),
});
export type DatosUsuario = z.input<typeof esquemaUsuario>;

function validar(datos: DatosUsuario) {
  const r = esquemaUsuario.safeParse(datos);
  if (!r.success) throw new ErrorValidacion(r.error.issues[0].message);
  const permisos = r.data.permisos.filter((p): p is Permiso => PERMISOS_DELEGABLES.includes(p as Permiso));
  return { ...r.data, permisos };
}

export async function listarUsuarios() {
  const filas = await db.select().from(usuarios).orderBy(asc(usuarios.activo), asc(usuarios.nombre));
  const ahora = Date.now();
  return Promise.all(
    filas
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, "es"))
      .map(async (u) => ({
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo,
        debeCambiarClave: u.debeCambiarClave,
        ultimoIngreso: u.ultimoIngreso,
        bloqueadoMin: await minutosBloqueado(claveUsuario(u.usuario), ahora),
      })),
  );
}

export async function obtenerUsuario(id: number) {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!u) return null;
  const excepciones = await db.select().from(permisosUsuario).where(eq(permisosUsuario.usuarioId, id));
  const { claveHash: _omitida, ...resto } = u;
  void _omitida;
  return {
    ...resto,
    permisos: excepciones.filter((e) => e.concedido).map((e) => e.permiso),
    bloqueadoMin: await minutosBloqueado(claveUsuario(u.usuario)),
  };
}

/** Fotografía legible de un usuario para la auditoría. */
function foto(u: { nombre: string; usuario: string; rol: Rol; activo?: boolean; descuentoMaxPct: number | null; comisionPct: number }, permisos: string[]) {
  return {
    Usuario: u.usuario,
    Nombre: u.nombre,
    Rol: ROLES[u.rol],
    ...(u.activo === undefined ? {} : { Activo: u.activo ? "Sí" : "No" }),
    "Descuento máximo": u.descuentoMaxPct == null ? "General" : `${String(u.descuentoMaxPct / 100).replace(".", ",")} %`,
    Comisión: `${String(u.comisionPct / 100).replace(".", ",")} %`,
    Permisos: permisos.length ? permisos.map((p) => PERMISOS[p as Permiso] ?? p).join(", ") : "—",
  };
}

async function guardarPermisos(tx: Tx, usuarioId: number, rol: Rol, permisos: Permiso[]) {
  await tx.delete(permisosUsuario).where(eq(permisosUsuario.usuarioId, usuarioId));
  if (rol === "admin" || !permisos.length) return;
  await tx.insert(permisosUsuario).values(permisos.map((permiso) => ({ usuarioId, permiso, concedido: true })));
}

async function adminsActivos(tx: Tx, exceptoId?: number) {
  const filas = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.rol, "admin"), eq(usuarios.activo, true), exceptoId ? ne(usuarios.id, exceptoId) : undefined));
  return filas.length;
}

/** Crea un usuario con clave temporal (debe cambiarla al entrar). Devuelve la clave para dársela a la persona. */
export async function crearUsuario(datos: DatosUsuario, actor: Actor, claveInicial?: string) {
  const d = validar(datos);
  const clave = claveInicial ?? claveTemporal();
  const problema = claveInicial ? problemaClave(claveInicial, d.usuario) : null;
  if (problema) throw new ErrorValidacion(problema);
  const hash = await hashClave(clave);
  const id = await db.transaction(async (tx) => {
    const [existe] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, d.usuario));
    if (existe) throw new ErrorValidacion(`Ya existe un usuario «${d.usuario}». Elegí otro nombre de usuario.`);
    const [nuevo] = await tx
      .insert(usuarios)
      .values({
        usuario: d.usuario,
        nombre: d.nombre,
        rol: d.rol,
        claveHash: hash,
        debeCambiarClave: !claveInicial,
        descuentoMaxPct: d.descuentoMaxPct,
        comisionPct: d.comisionPct,
      })
      .returning({ id: usuarios.id });
    await guardarPermisos(tx, nuevo.id, d.rol, d.permisos);
    await auditar(tx, actor, {
      accion: "alta",
      entidad: "usuario",
      entidadId: nuevo.id,
      descripcion: `Creó el usuario «${d.usuario}» (${d.nombre}, ${ROLES[d.rol]})`,
      despues: foto({ ...d, activo: true }, d.rol === "admin" ? [] : d.permisos),
    });
    return nuevo.id;
  });
  return { id, claveTemporal: claveInicial ? null : clave };
}

export async function editarUsuario(id: number, datos: DatosUsuario, actor: Actor) {
  const d = validar(datos);
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, id));
    if (!u) throw new ErrorValidacion("El usuario no existe.");
    if (d.usuario !== u.usuario) {
      const [otro] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, d.usuario));
      if (otro) throw new ErrorValidacion(`Ya existe un usuario «${d.usuario}».`);
    }
    if (u.rol === "admin" && d.rol !== "admin" && u.activo && (await adminsActivos(tx, id)) === 0)
      throw new ErrorValidacion("Tiene que quedar al menos un administrador activo.");
    if (id === actor.id && d.rol !== u.rol) throw new ErrorValidacion("No podés cambiar tu propio rol.");

    const permisosAntes = (await tx.select().from(permisosUsuario).where(eq(permisosUsuario.usuarioId, id)))
      .filter((p) => p.concedido)
      .map((p) => p.permiso)
      .sort();
    const permisosDespues = d.rol === "admin" ? [] : [...d.permisos].sort();
    const antes = foto(u, permisosAntes);
    const despues = foto({ ...u, ...d }, permisosDespues);
    const dif = diferencias(antes, despues);
    if (!dif.hayCambios) return;

    // Si cambia el rol o los permisos, se cierran sus sesiones para que tome los cambios al volver a entrar.
    const cambiaAcceso = u.rol !== d.rol || JSON.stringify(permisosAntes) !== JSON.stringify(permisosDespues);
    await tx
      .update(usuarios)
      .set({
        usuario: d.usuario,
        nombre: d.nombre,
        rol: d.rol,
        descuentoMaxPct: d.descuentoMaxPct,
        comisionPct: d.comisionPct,
        actualizadoEn: new Date(),
        ...(cambiaAcceso && id !== actor.id ? { versionSesion: u.versionSesion + 1 } : {}),
      })
      .where(eq(usuarios.id, id));
    await guardarPermisos(tx, id, d.rol, d.permisos);
    await auditar(tx, actor, {
      accion: "modificacion",
      entidad: "usuario",
      entidadId: id,
      descripcion: `Modificó el usuario «${d.usuario}» (${Object.keys(dif.despues).join(", ").toLowerCase()})`,
      antes: dif.antes,
      despues: dif.despues,
    });
  });
}

export async function cambiarEstadoUsuario(id: number, activo: boolean, actor: Actor) {
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, id));
    if (!u) throw new ErrorValidacion("El usuario no existe.");
    if (u.activo === activo) return;
    if (!activo && id === actor.id) throw new ErrorValidacion("No podés desactivar tu propio usuario.");
    if (!activo && u.rol === "admin" && (await adminsActivos(tx, id)) === 0)
      throw new ErrorValidacion("Tiene que quedar al menos un administrador activo.");
    await tx
      .update(usuarios)
      .set({ activo, actualizadoEn: new Date(), versionSesion: u.versionSesion + 1 })
      .where(eq(usuarios.id, id));
    await auditar(tx, actor, {
      accion: activo ? "reactivacion" : "desactivacion",
      entidad: "usuario",
      entidadId: id,
      descripcion: `${activo ? "Reactivó" : "Desactivó"} el usuario «${u.usuario}» (${u.nombre})`,
      antes: { Activo: u.activo ? "Sí" : "No" },
      despues: { Activo: activo ? "Sí" : "No" },
    });
  });
}

/** El admin reinicia la clave de otra persona: genera una temporal y la obliga a cambiarla al entrar. */
export async function reiniciarClave(id: number, actor: Actor) {
  const temporal = claveTemporal();
  const hash = await hashClave(temporal);
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, id));
    if (!u) throw new ErrorValidacion("El usuario no existe.");
    await tx
      .update(usuarios)
      .set({ claveHash: hash, debeCambiarClave: true, versionSesion: u.versionSesion + 1, actualizadoEn: new Date() })
      .where(eq(usuarios.id, id));
    await auditar(tx, actor, {
      accion: "cambio_clave",
      entidad: "usuario",
      entidadId: id,
      descripcion: `Reinició la clave de «${u.usuario}» (clave temporal, debe cambiarla al entrar)`,
    });
  });
  await limpiarFallos(claveUsuario((await obtenerUsuario(id))!.usuario));
  return temporal;
}

/** Cada persona cambia su propia clave (pide la actual). Cierra sus otras sesiones abiertas. */
export async function cambiarClavePropia(id: number, actual: string, nueva: string, actor: Actor, sesionActual: string) {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!u) throw new ErrorValidacion("El usuario no existe.");
  if (!(await verificarClave(actual, u.claveHash))) throw new ErrorValidacion("La clave actual no es correcta.");
  const problema = problemaClave(nueva, u.usuario);
  if (problema) throw new ErrorValidacion(problema);
  if (await verificarClave(nueva, u.claveHash)) throw new ErrorValidacion("La clave nueva tiene que ser distinta de la actual.");
  const hash = await hashClave(nueva);
  await db.transaction(async (tx) => {
    const version = u.versionSesion + 1;
    await tx
      .update(usuarios)
      .set({ claveHash: hash, debeCambiarClave: false, versionSesion: version, actualizadoEn: new Date() })
      .where(eq(usuarios.id, id));
    // La sesión desde la que se cambió sigue abierta; las demás se cierran.
    await tx.update(sesiones).set({ version }).where(eq(sesiones.id, sesionActual));
    await auditar(tx, actor, {
      accion: "cambio_clave",
      entidad: "usuario",
      entidadId: id,
      descripcion: "Cambió su clave",
    });
  });
}

export async function desbloquearUsuario(id: number, actor: Actor) {
  const u = await obtenerUsuario(id);
  if (!u) throw new ErrorValidacion("El usuario no existe.");
  await limpiarFallos(claveUsuario(u.usuario));
  await db.transaction(async (tx) => {
    await auditar(tx, actor, {
      accion: "desbloqueo",
      entidad: "usuario",
      entidadId: id,
      descripcion: `Desbloqueó el ingreso de «${u.usuario}»`,
    });
  });
}

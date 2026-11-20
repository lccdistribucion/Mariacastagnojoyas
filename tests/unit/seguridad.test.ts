import assert from "node:assert/strict";
import { before, test } from "node:test";
import { basePrueba } from "./preparar";

let m: {
  ingreso: typeof import("../../src/lib/auth/ingreso");
  usuarios: typeof import("../../src/lib/usuarios");
  autorizacion: typeof import("../../src/lib/auth/autorizacion");
  config: typeof import("../../src/lib/config");
  auditoria: typeof import("../../src/lib/auditoria-consulta");
};
const SIS = { id: null, nombre: "Sistema" };

before(async () => {
  await basePrueba();
  m = {
    ingreso: await import("../../src/lib/auth/ingreso"),
    usuarios: await import("../../src/lib/usuarios"),
    autorizacion: await import("../../src/lib/auth/autorizacion"),
    config: await import("../../src/lib/config"),
    auditoria: await import("../../src/lib/auditoria-consulta"),
  };
  await m.usuarios.crearUsuario(
    { usuario: "admin", nombre: "Admin Prueba", rol: "admin", descuentoMaxPct: null, comisionPct: 0 },
    SIS,
    "Clave1234",
  );
  await m.usuarios.crearUsuario(
    { usuario: "vende", nombre: "Vendedora Prueba", rol: "usuario", descuentoMaxPct: null, comisionPct: 0 },
    SIS,
    "Venta1234",
  );
});

test("ingreso correcto crea sesión y queda en auditoría", async () => {
  const r = await m.ingreso.intentarIngreso("ADMIN ", "Clave1234", { ip: "1.1.1.1" });
  assert.ok(r.ok);
  const u = await m.ingreso.validarSesion(r.token);
  assert.equal(u?.usuario, "admin");
  const { filas } = await m.auditoria.consultarAuditoria({ accion: "ingreso" });
  assert.ok(filas.some((f) => f.usuarioNombre === "Admin Prueba"));
});

test("la clave nunca se guarda en la base en texto ni en la auditoría", async () => {
  const { filas } = await m.auditoria.consultarAuditoria({}, true);
  for (const f of filas) {
    assert.ok(!`${f.antes}${f.despues}`.includes("Clave1234"));
    assert.ok(!`${f.antes}${f.despues}`.includes("$2"));
  }
});

test("bloqueo tras 5 intentos fallidos (y la clave correcta tampoco entra mientras dure)", async () => {
  for (let i = 0; i < 4; i++) {
    const r = await m.ingreso.intentarIngreso("vende", "mala", { ip: "2.2.2.2" });
    assert.ok(!r.ok);
  }
  const quinto = await m.ingreso.intentarIngreso("vende", "mala", { ip: "2.2.2.2" });
  assert.ok(!quinto.ok && /bloqueado/.test(quinto.error));
  const correcta = await m.ingreso.intentarIngreso("vende", "Venta1234", { ip: "3.3.3.3" });
  assert.ok(!correcta.ok && /bloqueado/.test(correcta.error));
  // el admin la desbloquea
  const lista = await m.usuarios.listarUsuarios();
  const v = lista.find((u) => u.usuario === "vende")!;
  assert.ok(v.bloqueadoMin > 0);
  await m.usuarios.desbloquearUsuario(v.id, SIS);
  const r = await m.ingreso.intentarIngreso("vende", "Venta1234", { ip: "3.3.3.3" });
  assert.ok(r.ok);
});

test("usuario inexistente da el mismo mensaje que clave incorrecta", async () => {
  const a = await m.ingreso.intentarIngreso("noexiste", "algo", { ip: "4.4.4.4" });
  const b = await m.ingreso.intentarIngreso("admin", "algo", { ip: "5.5.5.5" });
  assert.ok(!a.ok && !b.ok);
  assert.equal(a.error, b.error);
});

test("cierre de sesión por inactividad", async () => {
  const r = await m.ingreso.intentarIngreso("admin", "Clave1234", { ip: "6.6.6.6" });
  assert.ok(r.ok);
  const min = await m.config.leerUna("seguridad.inactividad_minutos");
  assert.ok(await m.ingreso.validarSesion(r.token));
  const despues = Date.now() + (min + 1) * 60000;
  assert.equal(await m.ingreso.validarSesion(r.token, despues), null);
  // y queda cerrada para siempre
  assert.equal(await m.ingreso.validarSesion(r.token), null);
});

test("desactivar un usuario cierra sus sesiones y le impide entrar", async () => {
  const r = await m.ingreso.intentarIngreso("vende", "Venta1234", { ip: "7.7.7.7" });
  assert.ok(r.ok);
  const v = (await m.usuarios.listarUsuarios()).find((u) => u.usuario === "vende")!;
  await m.usuarios.cambiarEstadoUsuario(v.id, false, SIS);
  assert.equal(await m.ingreso.validarSesion(r.token), null);
  const otra = await m.ingreso.intentarIngreso("vende", "Venta1234", { ip: "7.7.7.7" });
  assert.ok(!otra.ok && /desactivado/.test(otra.error));
  await m.usuarios.cambiarEstadoUsuario(v.id, true, SIS);
});

test("siempre queda al menos un administrador activo, y nadie se desactiva a sí mismo", async () => {
  const a = (await m.usuarios.listarUsuarios()).find((u) => u.usuario === "admin")!;
  await assert.rejects(m.usuarios.cambiarEstadoUsuario(a.id, false, SIS), /al menos un administrador/);
  await assert.rejects(m.usuarios.cambiarEstadoUsuario(a.id, false, { id: a.id, nombre: "Admin" }), /propio/);
});

test("no se pueden repetir nombres de usuario", async () => {
  await assert.rejects(
    m.usuarios.crearUsuario({ usuario: "Admin", nombre: "Otro", rol: "usuario", descuentoMaxPct: null, comisionPct: 0 }, SIS),
    /Ya existe/,
  );
});

test("editar guarda en auditoría solo lo que cambió (antes y después)", async () => {
  const v = (await m.usuarios.listarUsuarios()).find((u) => u.usuario === "vende")!;
  await m.usuarios.editarUsuario(
    v.id,
    { usuario: "vende", nombre: "Vendedora Prueba", rol: "usuario", descuentoMaxPct: 1500, comisionPct: 0, permisos: ["ver_sin_facturar"] },
    SIS,
  );
  const { filas } = await m.auditoria.consultarAuditoria({ entidad: "usuario", accion: "modificacion" });
  const ultima = filas[0];
  assert.deepEqual(JSON.parse(ultima.antes!), { "Descuento máximo": "General", Permisos: "—" });
  assert.deepEqual(JSON.parse(ultima.despues!), { "Descuento máximo": "15 %", Permisos: "Ver ventas sin facturar" });
});

test("clave temporal: obliga a cambiarla, y el cambio cierra las otras sesiones", async () => {
  const v = (await m.usuarios.listarUsuarios()).find((u) => u.usuario === "vende")!;
  const temporal = await m.usuarios.reiniciarClave(v.id, SIS);
  const r1 = await m.ingreso.intentarIngreso("vende", temporal, { ip: "8.8.8.8" });
  const r2 = await m.ingreso.intentarIngreso("vende", temporal, { ip: "8.8.8.8" });
  assert.ok(r1.ok && r1.debeCambiarClave && r2.ok);
  const s1 = (await m.ingreso.validarSesion(r1.token))!;
  await assert.rejects(m.usuarios.cambiarClavePropia(v.id, temporal, "corta", SIS, s1.sesionId), /8 caracteres/);
  await m.usuarios.cambiarClavePropia(v.id, temporal, "NuevaClave99", SIS, s1.sesionId);
  assert.ok(await m.ingreso.validarSesion(r1.token), "la sesión desde la que cambió sigue abierta");
  assert.equal(await m.ingreso.validarSesion(r2.token), null, "las otras sesiones se cierran");
});

test("autorización con clave de admin: válida solo con un administrador", async () => {
  const sol = { id: 2, nombre: "Vendedora Prueba" };
  const ok = await m.autorizacion.autorizarConAdmin(sol, { usuario: "admin", clave: "Clave1234" }, "Descuento 20 %");
  assert.ok(ok.ok);
  const no = await m.autorizacion.autorizarConAdmin(sol, { usuario: "vende", clave: "NuevaClave99" }, "Descuento 20 %");
  assert.ok(!no.ok);
  const { filas } = await m.auditoria.consultarAuditoria({ texto: "Descuento 20" });
  assert.equal(filas.length, 2);
});

test("configuración: valida valores y registra antes/después", async () => {
  await assert.rejects(m.config.guardarConfig({ "seguridad.intentos_max": 1 }, SIS), /no es válido/);
  await m.config.guardarConfig({ "seguridad.inactividad_minutos": 20 }, SIS);
  assert.equal(await m.config.leerUna("seguridad.inactividad_minutos"), 20);
  const { filas } = await m.auditoria.consultarAuditoria({ entidad: "configuracion" });
  assert.deepEqual(JSON.parse(filas[0].antes!), { "Cerrar sesión tras minutos sin uso": 30 });
});

test("un mismo equipo se bloquea recién con el triple de fallos (probando muchos usuarios)", async () => {
  for (let i = 0; i < 14; i++) {
    const r = await m.ingreso.intentarIngreso(`inventado${i}`, "x", { ip: "9.9.9.9" });
    assert.ok(!r.ok && !/bloqueado/.test(r.error), `intento ${i + 1} todavía no bloquea`);
  }
  const r = await m.ingreso.intentarIngreso("inventado99", "x", { ip: "9.9.9.9" });
  assert.ok(!r.ok && /bloqueado/.test(r.error));
  const admin = await m.ingreso.intentarIngreso("admin", "Clave1234", { ip: "9.9.9.9" });
  assert.ok(!admin.ok, "desde ese equipo nadie entra mientras dure el bloqueo");
});

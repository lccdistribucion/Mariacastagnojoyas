/**
 * Prueba completa (módulos 1 a 7) en un navegador real (Chromium), en computadora (1440 px) y en celular (390 px).
 * Usa una base de datos aparte (data/e2e.db), recién creada con los datos de prueba. Guarda capturas en
 * tests/e2e/capturas (o en la carpeta de CAPTURAS). Requiere haber compilado antes (`npm run build`).
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const RAIZ = path.resolve(import.meta.dirname, "../..");
const PUERTO = 3191;
const URL_BASE = `http://127.0.0.1:${PUERTO}`;
const CAPTURAS = process.env.CAPTURAS ?? path.join(RAIZ, "tests/e2e/capturas");
const BASE = path.join(RAIZ, "data/e2e.db");

rmSync(CAPTURAS, { recursive: true, force: true });
mkdirSync(CAPTURAS, { recursive: true });
for (const f of [BASE, `${BASE}-wal`, `${BASE}-shm`]) rmSync(f, { force: true });
const SIMULACION = path.join(RAIZ, "data/simulacion-cotizaciones.json");
rmSync(SIMULACION, { force: true });
const env = { ...process.env, DATABASE_URL: `file:${BASE}`, TZ: "America/Argentina/Buenos_Aires", COTIZACIONES_SIMULADAS: "1", BACKUPS_DIR: path.join(RAIZ, "data/e2e-backups") };
execSync("npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts && npx tsx tests/e2e/historial-prueba.ts", { cwd: RAIZ, env, stdio: "inherit" });

// Proceso aparte con su propio grupo: al terminar se cierra el servidor completo (npx + next).
const servidor = spawn("npx", ["next", "start", "-p", String(PUERTO), "-H", "127.0.0.1"], { cwd: RAIZ, env, stdio: "pipe", detached: true });
const apagar = () => {
  try {
    process.kill(-servidor.pid, "SIGTERM");
  } catch {}
};
process.on("exit", apagar);
servidor.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
await new Promise((ok, mal) => {
  const t = setTimeout(() => mal(new Error("El servidor no arrancó")), 60000);
  servidor.stdout.on("data", (d) => String(d).includes("Ready") && (clearTimeout(t), ok()));
});

let fallas = 0;
const paginasAbiertas = [];
const errores = [];
const paso = async (nombre, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallas++;
    for (const [i, p] of paginasAbiertas.entries()) await p.screenshot({ path: path.join(CAPTURAS, `FALLA-${nombre.slice(0, 30).replace(/[^a-z0-9]+/gi, "-")}-${i}.png`) }).catch(() => {});
    console.log(`  ✗ ${nombre}\n    ${String(e.message).split("\n")[0]}`);
  }
};
const verificar = (cond, msj) => {
  if (!cond) throw new Error(msj);
};

const navegador = await chromium.launch();
const PC = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" };
const CELU = { ...devices["iPhone 13"], locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" };

async function nuevaPagina(opciones) {
  const ctx = await navegador.newContext({ ...opciones, acceptDownloads: true });
  const page = await ctx.newPage();
  paginasAbiertas.push(page);
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/401|403/.test(m.text()) && errores.push(`console: ${m.text()}`));
  page.on("dialog", (d) => d.accept());
  page.on("response", (r) => r.status() === 404 && errores.push(`404: ${r.url()}`));
  return { ctx, page };
}
const foto = (page, nombre, completa = false) => page.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`), fullPage: completa });
async function sinDesborde(page) {
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  verificar(ancho <= 1, `la pantalla se desborda ${ancho}px a lo ancho en ${page.url()}`);
}
/** Texto del aviso de error (Next agrega un «alert» vacío propio para anunciar navegaciones: se ignora). */
async function alerta(page) {
  const l = page.locator("main [role=alert]").filter({ hasText: /\S/ }).first();
  await l.waitFor();
  return l.innerText();
}
async function ingresar(page, usuario, clave) {
  await page.goto(`${URL_BASE}/ingresar`);
  await page.fill("#usuario", usuario);
  await page.fill("#clave", clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

console.log("Módulo 1 — ingreso, roles y auditoría");
const pc = await nuevaPagina(PC);
const celu = await nuevaPagina(CELU);
let claveSofia = "";

await paso("pantalla de ingreso (PC y celular)", async () => {
  await pc.page.goto(URL_BASE);
  await pc.page.waitForURL("**/ingresar");
  await foto(pc.page, "01-ingreso-pc");
  await celu.page.goto(`${URL_BASE}/ingresar`);
  await sinDesborde(celu.page);
  await foto(celu.page, "01-ingreso-celular");
});

await paso("5 claves incorrectas bloquean al usuario (y avisa cuántos intentos quedan)", async () => {
  let ultimo = "";
  for (let i = 0; i < 5; i++) {
    await ingresar(celu.page, "lucia", "incorrecta");
    ultimo = await alerta(celu.page);
    if (i === 3) verificar(/queda 1 intento/.test(ultimo), `aviso de intentos: ${ultimo}`);
  }
  verificar(/bloqueado/.test(ultimo), `esperaba bloqueo, dijo: ${ultimo}`);
  await foto(celu.page, "02-bloqueo-celular");
  await ingresar(celu.page, "lucia", "Mostrador2026");
  verificar(/bloqueado/.test(await alerta(celu.page)), "con la clave correcta tampoco debe entrar");
});

await paso("la administradora ingresa e Inicio muestra el resumen", async () => {
  await ingresar(pc.page, "maria", "Castagno2026");
  await pc.page.waitForURL(`${URL_BASE}/`);
  await pc.page.getByText("Intentos fallidos hoy").waitFor();
  await foto(pc.page, "03-inicio-admin-pc", true);
  await ingresar(celu.page, "maria", "Castagno2026");
  await celu.page.waitForURL(`${URL_BASE}/`);
  await sinDesborde(celu.page);
  await foto(celu.page, "03-inicio-admin-celular", true);
  await celu.page.getByRole("button", { name: "Abrir menú" }).click();
  await celu.page.getByRole("dialog", { name: "Menú" }).waitFor();
  await foto(celu.page, "04-menu-admin-celular");
  await celu.page.getByRole("button", { name: "Cerrar menú" }).click();
});

await paso("crear usuario: muestra la clave temporal una sola vez", async () => {
  await pc.page.goto(`${URL_BASE}/usuarios`);
  await pc.page.getByRole("link", { name: "Nuevo usuario" }).click();
  await pc.page.fill("#nombre", "Sofía Gómez");
  await pc.page.fill("#usuario", "sofia");
  await foto(pc.page, "05-nuevo-usuario-pc", true);
  await pc.page.getByRole("button", { name: "Crear usuario" }).click();
  claveSofia = (await pc.page.locator("[data-clave-temporal]").innerText()).trim();
  verificar(/^[a-z]{5}\d{3}$/.test(claveSofia), `clave temporal rara: ${claveSofia}`);
  await foto(pc.page, "06-clave-temporal-pc");
});

await paso("no deja repetir un usuario", async () => {
  await pc.page.goto(`${URL_BASE}/usuarios/nuevo`);
  await pc.page.fill("#nombre", "Otra Sofía");
  await pc.page.fill("#usuario", "sofia");
  await pc.page.getByRole("button", { name: "Crear usuario" }).click();
  verificar(/Ya existe/.test(await alerta(pc.page)), "debería avisar que ya existe");
});

await paso("lista de usuarios con estados (bloqueada, clave temporal)", async () => {
  await pc.page.goto(`${URL_BASE}/usuarios`);
  const tabla = pc.page.locator("table");
  await tabla.getByText("Bloqueado", { exact: false }).first().waitFor();
  await tabla.getByText("Clave temporal").first().waitFor();
  await foto(pc.page, "07-usuarios-pc");
  await celu.page.goto(`${URL_BASE}/usuarios`);
  await sinDesborde(celu.page);
  await foto(celu.page, "07-usuarios-celular", true);
});

await paso("editar vendedora: desbloquear, permiso especial y descuento propio", async () => {
  await pc.page.goto(`${URL_BASE}/usuarios`);
  await pc.page.locator("table").getByRole("link", { name: "Lucía Fernández" }).click();
  await pc.page.getByRole("button", { name: "Desbloquear ingreso" }).click();
  await pc.page.getByText("Ingreso desbloqueado.").waitFor();
  await pc.page.fill("#descuentoMax", "15");
  await pc.page.getByLabel("Ver ventas sin facturar").check();
  await pc.page.getByRole("button", { name: "Guardar cambios" }).click();
  await pc.page.getByText("Cambios guardados.").waitFor();
  await pc.page.reload();
  await foto(pc.page, "08-editar-usuario-pc", true);
  await celu.page.goto(pc.page.url());
  await sinDesborde(celu.page);
  await foto(celu.page, "08-editar-usuario-celular", true);
});

await paso("configuración: cambia la inactividad a 2 minutos", async () => {
  await pc.page.goto(`${URL_BASE}/configuracion`);
  await pc.page.fill("#inactividad", "2");
  await pc.page.getByRole("button", { name: "Guardar configuración" }).click();
  await pc.page.getByText("Configuración guardada.").waitFor();
  await foto(pc.page, "09-configuracion-pc", true);
  await celu.page.goto(`${URL_BASE}/configuracion`);
  await sinDesborde(celu.page);
});

await paso("auditoría: lista, detalle antes/después y exportación a Excel y PDF", async () => {
  await pc.page.goto(`${URL_BASE}/auditoria`);
  await pc.page.getByText("Modificó el usuario «lucia»").click();
  await pc.page.getByText("Ver ventas sin facturar").first().waitFor();
  await foto(pc.page, "10-auditoria-pc", true);
  for (const [nombre, firma] of [["Excel", "PK"], ["PDF", "%PDF"]]) {
    const [descarga] = await Promise.all([pc.page.waitForEvent("download"), pc.page.getByRole("link", { name: nombre }).click()]);
    const archivo = path.join(CAPTURAS, descarga.suggestedFilename());
    await descarga.saveAs(archivo);
    verificar(readFileSync(archivo).subarray(0, firma.length).toString() === firma, `${nombre} no es un archivo válido`);
  }
  await celu.page.goto(`${URL_BASE}/auditoria?accion=ingreso_fallido`);
  await sinDesborde(celu.page);
  await foto(celu.page, "10-auditoria-celular", true);
});

await paso("salir cierra la sesión", async () => {
  await pc.page.getByRole("button", { name: "Salir" }).click();
  await pc.page.waitForURL("**/ingresar?motivo=salida");
  await pc.page.goto(`${URL_BASE}/usuarios`);
  await pc.page.waitForURL("**/ingresar");
});

await paso("primer ingreso con clave temporal obliga a elegir una propia", async () => {
  const s = await nuevaPagina(CELU);
  await ingresar(s.page, "sofia", claveSofia);
  await s.page.waitForURL("**/cambiar-clave");
  await s.page.goto(`${URL_BASE}/`);
  await s.page.waitForURL("**/cambiar-clave");
  await sinDesborde(s.page);
  await foto(s.page, "11-cambiar-clave-celular", true);
  await s.page.fill("#actual", claveSofia);
  await s.page.fill("#nueva", "Anillo2026");
  await s.page.fill("#repetir", "Anillo2026");
  await s.page.getByRole("button", { name: "Guardar clave nueva" }).click();
  await s.page.waitForURL("**/?aviso=clave");
  await s.ctx.close();
});

await paso("la vendedora no ve ni entra a lo de administración (pantallas y API)", async () => {
  const v = await nuevaPagina(CELU);
  await v.page.clock.install();
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  await sinDesborde(v.page);
  await foto(v.page, "12-inicio-vendedora-celular", true);
  await v.page.getByRole("button", { name: "Abrir menú" }).click();
  const menu = v.page.getByRole("dialog", { name: "Menú" });
  verificar((await menu.getByText("Administración").count()) === 0, "la vendedora no debe ver Administración");
  await foto(v.page, "13-menu-vendedora-celular");
  await v.page.goto(`${URL_BASE}/usuarios`);
  await v.page.waitForURL("**/sin-permiso");
  await foto(v.page, "14-sin-permiso-celular");
  const yo = await v.page.request.get(`${URL_BASE}/api/v1/yo`);
  verificar(yo.status() === 200 && (await yo.json()).permisos.includes("ver_sin_facturar"), "API /yo con su permiso especial");
  verificar((await v.page.request.get(`${URL_BASE}/api/v1/usuarios`)).status() === 403, "API usuarios debe dar 403");
  verificar((await v.page.request.get(`${URL_BASE}/auditoria/exportar?formato=xlsx`)).status() === 403, "exportar auditoría debe dar 403");

  // Inactividad (configurada en 2 minutos): a los 70 s aparece el aviso; a los 2 min se cierra sola.
  await v.page.goto(`${URL_BASE}/`);
  await v.page.clock.fastForward("01:10");
  await v.page.getByText("la sesión se cierra en").waitFor();
  await foto(v.page, "15-aviso-inactividad-celular");
  await v.page.clock.fastForward("01:00");
  await v.page.waitForURL("**/ingresar?motivo=inactividad");
  await foto(v.page, "16-cerrada-por-inactividad-celular");
  verificar((await v.page.request.get(`${URL_BASE}/api/v1/yo`)).status() === 401, "tras la inactividad, la sesión ya no sirve");
  await v.ctx.close();
});

await paso("sin sesión la API responde 401", async () => {
  const r = await fetch(`${URL_BASE}/api/v1/auditoria`);
  verificar(r.status === 401, `respondió ${r.status}`);
});

console.log("Módulo 2 — cotizaciones automáticas");
const simular = (x) => (x ? writeFileSync(SIMULACION, JSON.stringify(x)) : rmSync(SIMULACION, { force: true }));
const admin = await nuevaPagina(PC);
const adminCelu = await nuevaPagina(CELU);
const barra = (page) => page.locator("[data-barra-cotizaciones]");

await paso("la barra muestra las cotizaciones actualizadas solas al arrancar", async () => {
  await ingresar(admin.page, "maria", "Castagno2026");
  await admin.page.waitForURL(`${URL_BASE}/`);
  // vuelve la inactividad a 30 minutos (la prueba anterior la dejó en 2)
  await admin.page.goto(`${URL_BASE}/configuracion`);
  await admin.page.fill("#inactividad", "30");
  await admin.page.getByRole("button", { name: "Guardar configuración" }).click();
  await admin.page.getByText("Configuración guardada.").waitFor();
  await admin.page.goto(`${URL_BASE}/`);
  const texto = await barra(admin.page).innerText();
  verificar(/\$ 1\.585\s*\/\s*\$ 1\.605/.test(texto), `dólar blue en la barra: ${texto}`);
  verificar(/US\$ 3\.846,60/.test(texto), "onza de oro en la barra");
  verificar(/Oro 18k \/g\s*\$ 148\.869/.test(texto), `gramo 18k (3846,6 ÷ 31,1035 × 0,75 × 1605): ${texto}`);
  await foto(admin.page, "20-inicio-con-cotizaciones-pc");
  await ingresar(adminCelu.page, "maria", "Castagno2026");
  await adminCelu.page.waitForURL(`${URL_BASE}/`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "20-inicio-con-cotizaciones-celular");
});

await paso("selector de dólar en la barra (y lo recuerda en ese equipo)", async () => {
  await barra(admin.page).getByLabel("Tipo de dólar").selectOption("USD_OFICIAL");
  verificar(/\$ 1\.525\s*\/\s*\$ 1\.575/.test(await barra(admin.page).innerText()), "muestra el oficial");
  await admin.page.reload();
  verificar(/\$ 1\.525\s*\/\s*\$ 1\.575/.test(await barra(admin.page).innerText()), "sigue en oficial al recargar");
  await barra(admin.page).getByLabel("Tipo de dólar").selectOption("USD_BLUE");
});

await paso("detalle de la barra con fuente, hora y estado de cada valor", async () => {
  await admin.page.getByRole("button", { name: "Ver detalle de cotizaciones" }).click();
  const panel = admin.page.getByRole("dialog", { name: "Detalle de cotizaciones" });
  await panel.getByText("DolarApi (simulado)").first().waitFor();
  verificar((await panel.getByText("Al día").count()) >= 8, "todas al día");
  await foto(admin.page, "21-detalle-barra-pc");
  await adminCelu.page.getByRole("button", { name: "Ver detalle de cotizaciones" }).click();
  await adminCelu.page.getByRole("dialog", { name: "Detalle de cotizaciones" }).waitFor();
  await foto(adminCelu.page, "21-detalle-barra-celular");
  await admin.page.keyboard.press("Escape");
});

await paso("pantalla de Cotizaciones: precio por ley, gráficos con valor al pasar y tabla", async () => {
  await admin.page.goto(`${URL_BASE}/cotizaciones?periodo=90`);
  await admin.page.getByText("Precio por gramo").waitFor();
  const fila18 = admin.page.locator("tr", { hasText: "Oro 18k" });
  verificar(/\$ 148\.869/.test(await fila18.innerText()), "18k mercado en la tabla");
  const grafico = admin.page.locator("figure").first();
  await grafico.scrollIntoViewIfNeeded();
  const caja = await grafico.locator("svg").boundingBox();
  await admin.page.mouse.move(caja.x + caja.width * 0.6, caja.y + caja.height / 2);
  await grafico.getByRole("status").waitFor();
  await foto(admin.page, "22-cotizaciones-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/cotizaciones?periodo=90`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "22-cotizaciones-celular", true);
});

await paso("si la fuente principal falla se usa el respaldo y llega un aviso", async () => {
  simular({ fallan: ["dolarapi"] });
  await admin.page.goto(`${URL_BASE}/cotizaciones`);
  await admin.page.getByRole("button", { name: "Actualizar ahora" }).click();
  await admin.page.getByText("con la fuente de respaldo").waitFor();
  await admin.page.goto(`${URL_BASE}/alertas`);
  await admin.page.getByText("Fuente principal sin respuesta: DolarApi").first().waitFor();
  await foto(admin.page, "23-avisos-pc");
  await adminCelu.page.goto(`${URL_BASE}/alertas`);
  await sinDesborde(adminCelu.page);
  verificar(/Avisos: \d+ sin leer/.test((await adminCelu.page.getByRole("link", { name: /^Avisos/ }).first().getAttribute("aria-label")) ?? ""), "contador de avisos en el celular");
  await foto(adminCelu.page, "23-avisos-celular", true);
});

await paso("si no responde ninguna fuente: sigue con el último valor, en rojo, y avisa", async () => {
  simular({ fallan: ["dolarapi", "criptoya", "bluelytics", "goldapi", "bcra"] });
  await admin.page.goto(`${URL_BASE}/cotizaciones`);
  await admin.page.getByRole("button", { name: "Actualizar ahora" }).click();
  await admin.page.getByText("Ninguna fuente respondió").first().waitFor();
  await admin.page.reload();
  verificar(/\$ 1\.585\s*\/\s*\$ 1\.605/.test(await barra(admin.page).innerText()), "mantiene el último valor");
  verificar((await admin.page.getByText("Falló", { exact: true }).count()) > 0, "marca el fallo");
  await adminCelu.page.goto(`${URL_BASE}/`);
  await adminCelu.page.getByRole("button", { name: "Ver detalle de cotizaciones" }).click();
  await foto(adminCelu.page, "24-sin-fuentes-celular");
  simular(null);
  await admin.page.getByRole("button", { name: "Actualizar ahora" }).click();
  await admin.page.getByText("cotizaciones actualizadas").waitFor();
});

await paso("cotización propia del negocio: manda hasta que se quita", async () => {
  await admin.page.goto(`${URL_BASE}/cotizaciones`);
  await admin.page.selectOption("#codigo", "USD_BLUE");
  await admin.page.fill("#compra", "1.560");
  await admin.page.fill("#venta", "1.590");
  await admin.page.getByLabel("Fijar como cotización propia del negocio").check();
  await admin.page.getByRole("button", { name: "Guardar cotización" }).click();
  await admin.page.getByText("Cotización propia fijada").waitFor();
  await admin.page.reload();
  verificar(/\$ 1\.560\s*\/\s*\$ 1\.590/.test(await barra(admin.page).innerText()), "la barra usa la propia");
  await admin.page.getByRole("button", { name: "Actualizar ahora" }).click();
  await admin.page.getByText("cotizaciones actualizadas").waitFor();
  await admin.page.reload();
  verificar(/\$ 1\.560/.test(await barra(admin.page).innerText()), "la automática no la pisa");
  await admin.page.getByRole("button", { name: /Quitar/ }).click();
  await admin.page.waitForLoadState("networkidle");
  await admin.page.reload();
  verificar(/\$ 1\.585\s*\/\s*\$ 1\.605/.test(await barra(admin.page).innerText()), "vuelve a la automática");
});

await paso("configuración: dólar de referencia y ajuste de venta de una ley", async () => {
  await admin.page.goto(`${URL_BASE}/configuracion/cotizaciones`);
  await admin.page.selectOption("#referencia", "USD_OFICIAL");
  await admin.page.getByRole("button", { name: "Guardar", exact: true }).click();
  await admin.page.getByText("Configuración guardada.").waitFor();
  const ley = admin.page.locator("details", { hasText: "Oro 18k" }).first();
  await ley.locator("summary").click();
  await ley.getByLabel("Ajuste precio de venta (%)").fill("10");
  await ley.getByRole("button", { name: "Guardar ley" }).click();
  await ley.getByText("Ley guardada.").waitFor();
  await foto(admin.page, "25-config-cotizaciones-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/configuracion/cotizaciones`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "25-config-cotizaciones-celular", true);
  await admin.page.goto(`${URL_BASE}/cotizaciones`);
  // 3846,6 ÷ 31,1035 × 0,75 × 1575 (oficial) = 146.086 ; +10 % = 160.695
  const fila18 = await admin.page.locator("tr", { hasText: "Oro 18k" }).innerText();
  verificar(/\$ 146\.086/.test(fila18) && /\$ 160\.695/.test(fila18), `18k con dólar oficial y +10 %: ${fila18}`);
  await admin.page.goto(`${URL_BASE}/configuracion/cotizaciones`);
  await admin.page.selectOption("#referencia", "USD_BLUE");
  await admin.page.getByRole("button", { name: "Guardar", exact: true }).click();
  await admin.page.getByText("Configuración guardada.").waitFor();
});

await paso("historial de cotizaciones a Excel y PDF", async () => {
  await admin.page.goto(`${URL_BASE}/cotizaciones?periodo=30`);
  for (const [nombre, firma] of [["Exportar historial a Excel", "PK"], ["Exportar historial a PDF", "%PDF"]]) {
    const [descarga] = await Promise.all([admin.page.waitForEvent("download"), admin.page.getByRole("link", { name: nombre }).click()]);
    const archivo = path.join(CAPTURAS, descarga.suggestedFilename());
    await descarga.saveAs(archivo);
    verificar(readFileSync(archivo).subarray(0, firma.length).toString() === firma, `${nombre} inválido`);
  }
});

await paso("la vendedora ve las cotizaciones pero no puede cambiarlas", async () => {
  const v = await nuevaPagina(CELU);
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  verificar(/\$ 1\.605/.test(await barra(v.page).innerText()), "ve la barra");
  await v.page.getByRole("button", { name: "Ver detalle de cotizaciones" }).click();
  verificar((await v.page.getByRole("button", { name: "Actualizar ahora" }).count()) === 0, "no tiene «Actualizar ahora»");
  await v.page.goto(`${URL_BASE}/cotizaciones`);
  verificar((await v.page.getByText("Cargar una cotización a mano").count()) === 0, "no ve la carga manual");
  await foto(v.page, "26-cotizaciones-vendedora-celular", true);
  await v.page.goto(`${URL_BASE}/configuracion/cotizaciones`);
  await v.page.waitForURL("**/sin-permiso");
  verificar((await v.page.request.post(`${URL_BASE}/api/v1/cotizaciones/actualizar`)).status() === 403, "API actualizar 403");
  verificar((await v.page.request.get(`${URL_BASE}/api/v1/cotizaciones`)).status() === 200, "API consulta 200");
  await v.ctx.close();
});

console.log("Módulo 3 — piezas y stock");
const sharpE2E = createRequire(path.join(RAIZ, "package.json"))("sharp");
const fotoPrueba = await sharpE2E({ create: { width: 1400, height: 1400, channels: 3, background: "#f3ede2" } })
  .composite([{ input: Buffer.from('<svg width="1400" height="1400"><circle cx="700" cy="760" r="330" fill="none" stroke="#b8963e" stroke-width="70"/><path d="M640 330 L700 250 L760 330 L700 420 Z" fill="#dfe8f2" stroke="#9aa9b8" stroke-width="8"/></svg>'), top: 0, left: 0 }])
  .jpeg({ quality: 90 })
  .toBuffer();
let idNueva = 0;

await paso("listado de stock con fotos, filtros y valuación", async () => {
  await admin.page.goto(`${URL_BASE}/stock`);
  await admin.page.getByText("Valor a precio de venta").waitFor();
  verificar((await admin.page.locator('a[href^="/stock/"]').filter({ hasText: "Ejemplo" }).count()) >= 12, "muestra las piezas de ejemplo");
  await foto(admin.page, "30-stock-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/stock`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "30-stock-celular");
  await admin.page.goto(`${URL_BASE}/stock?bajo=1`);
  await admin.page.getByText("Bolsa de regalo con logo").waitFor();
});

await paso("alta de pieza por gramo: precio en vivo, piedra y código automático", async () => {
  await adminCelu.page.goto(`${URL_BASE}/stock/nueva`);
  const pg = adminCelu.page;
  await pg.fill("#nombre", "Anillo de compromiso (prueba)");
  await pg.selectOption("#categoriaId", { label: "Anillos" });
  await pg.selectOption("#leyId", { label: "Oro 18k" });
  await pg.fill("#pesoBruto", "3");
  await pg.fill("#pesoNeto", "2,8");
  await pg.fill("#talle", "13");
  await pg.getByRole("button", { name: "+ Agregar piedra" }).click();
  await pg.getByLabel("Tipo de piedra").fill("Diamante");
  await pg.getByLabel("Quilates").fill("0,10");
  await pg.getByText("Por gramo", { exact: true }).click();
  await pg.fill("#hechura", "150.000");
  // 18k con blue 1.605 = 148.868,93 el gramo; el módulo 2 le dejó +10 % de venta → 163.755,82
  // 2,8 g × 163.755,82 + 150.000 = 608.516
  await pg.getByText("$ 608.516").waitFor();
  await pg.selectOption("#ubicacionId", { label: "Vitrina principal" });
  await sinDesborde(pg);
  await foto(pg, "31-alta-pieza-celular", true);
  await pg.getByRole("button", { name: "Dar de alta" }).click();
  await pg.getByText("Pieza dada de alta").waitFor();
  verificar(/ANI-0003/.test(await pg.locator("h1").locator("..").innerText()), "código ANI-0003");
  idNueva = Number(pg.url().match(/stock\/(\d+)/)[1]);
});

await paso("si hay un error, lo escrito no se borra", async () => {
  await admin.page.goto(`${URL_BASE}/stock/nueva`);
  await admin.page.fill("#nombre", "Pieza con error");
  await admin.page.fill("#pesoBruto", "1");
  await admin.page.fill("#pesoNeto", "2");
  await admin.page.fill("#precioLista", "10.000");
  await admin.page.getByRole("button", { name: "Dar de alta" }).click();
  await admin.page.getByText("El peso neto no puede ser mayor que el bruto.").waitFor();
  verificar((await admin.page.inputValue("#nombre")) === "Pieza con error", "conserva el nombre");
});

await paso("fotos: sube, comprime y muestra en la ficha y el listado", async () => {
  await admin.page.goto(`${URL_BASE}/stock/${idNueva}`);
  await admin.page.locator('input[type="file"]').setInputFiles({ name: "anillo.jpg", mimeType: "image/jpeg", buffer: fotoPrueba });
  await admin.page.locator('img[alt="Anillo de compromiso (prueba)"]').waitFor();
  const r = await admin.page.request.get(`${URL_BASE}${await admin.page.locator('img[alt="Anillo de compromiso (prueba)"]').getAttribute("src")}`);
  verificar(r.status() === 200 && r.headers()["content-type"] === "image/webp", "foto en WebP");
  await foto(admin.page, "32-ficha-pieza-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/stock/${idNueva}`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "32-ficha-pieza-celular", true);
});

await paso("etiquetas en PDF (colita, adhesiva y A4)", async () => {
  for (const f of ["colita", "adhesiva", "a4"]) {
    const r = await admin.page.request.get(`${URL_BASE}/stock/etiquetas/pdf?ids=${idNueva},1,2&formato=${f}`);
    const cuerpo = await r.body();
    verificar(r.status() === 200 && cuerpo.subarray(0, 4).toString() === "%PDF", `etiqueta ${f}`);
    writeFileSync(path.join(CAPTURAS, `etiquetas-${f}.pdf`), cuerpo);
  }
});

await paso("pieza fuera del local (prueba de clienta) y vuelta", async () => {
  await admin.page.goto(`${URL_BASE}/stock?q=DIJ-0001`);
  await admin.page.getByText("Dije medalla Virgen Niña").click();
  await admin.page.getByText("Retirar del local (prueba, feria…)").click();
  await admin.page.fill("#detalle", "Clienta Laura G. (se lo prueba en su casa)");
  await admin.page.getByRole("button", { name: "Registrar salida" }).click();
  await admin.page.getByText("Fuera del local: Prueba de cliente").waitFor();
  await admin.page.goto(`${URL_BASE}/stock/salidas`);
  await admin.page.getByText("Clienta Laura G.").waitFor();
  await foto(admin.page, "33-fuera-del-local-pc");
  await admin.page.getByRole("button", { name: "Volvió" }).click();
  await admin.page.getByText("No hay piezas fuera del local.").waitFor();
});

await paso("la vendedora: no ve costos, y para ajustar stock necesita la clave de un administrador", async () => {
  const v = await nuevaPagina(CELU);
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  await v.page.goto(`${URL_BASE}/stock?q=CAD-0001`);
  verificar((await v.page.getByRole("link", { name: "Nueva pieza" }).count()) === 0, "sin «Nueva pieza»");
  await v.page.getByText("Cadena forzada 45 cm").click();
  verificar((await v.page.getByText(/^Costo /).count()) === 0, "no ve el costo");
  await v.page.getByText("Ajustar cantidad").click();
  await v.page.selectOption("#motivo", "faltante");
  await v.page.fill("#delta", "2");
  await v.page.fill("#detalleAjuste", "No están en el exhibidor");
  await v.page.fill("#adminUsuario", "maria");
  await v.page.fill("#adminClave", "mala");
  await v.page.getByRole("button", { name: "Registrar ajuste" }).click();
  verificar(/incorrectos/.test(await alerta(v.page)), "rechaza la clave equivocada");
  await v.page.fill("#adminClave", "Castagno2026");
  await v.page.getByRole("button", { name: "Registrar ajuste" }).click();
  await v.page.getByText("Ajuste registrado. Stock: 13.").waitFor();
  await v.page.reload();
  await v.page.getByText("Autorizó: María Castagno").first().waitFor();
  await foto(v.page, "34-ajuste-autorizado-celular", true);
  await v.ctx.close();
});

await paso("inventario físico: lectura, faltantes y sobrantes", async () => {
  const pg = adminCelu.page;
  await pg.goto(`${URL_BASE}/stock/inventario`);
  await pg.selectOption("#ubicacionId", { label: "Solo Vitrina principal" });
  await pg.getByRole("button", { name: "Empezar a contar" }).click();
  await pg.waitForURL(/inventario\/\d+/);
  for (const c of ["ANI-0001", "ALI-0001", "ani-0001", "XX-999"]) {
    await pg.fill('input[aria-label="Código leído"]', c);
    await pg.keyboard.press("Enter");
    await pg.getByText(c.toUpperCase()).first().waitFor();
  }
  await pg.getByText("ya la habías leído").waitFor();
  await pg.getByText("Este código no existe en el sistema").waitFor();
  await pg.reload();
  await pg.getByText("Faltantes (no se leyeron) (2)").waitFor();
  await sinDesborde(pg);
  await foto(pg, "35-inventario-celular", true);
  await pg.getByRole("button", { name: "Terminar y cerrar la toma" }).click();
  await pg.getByText("Toma cerrada.").waitFor();
});

await paso("actualización masiva de precios con vista previa", async () => {
  await admin.page.goto(`${URL_BASE}/stock/precios`);
  await admin.page.selectOption("#m-cat", { label: "Dijes" });
  await admin.page.fill("#m-pct", "10");
  await admin.page.fill("#m-mot", "prueba de actualización");
  await admin.page.getByRole("button", { name: "Ver vista previa" }).click();
  await admin.page.getByText("$ 42.000").waitFor(); // 38.000 + 10 % = 41.800 → redondeado a $ 1.000
  await foto(admin.page, "36-precios-masivo-pc", true);
  await admin.page.getByRole("button", { name: /Aplicar a 1 piezas/ }).click();
  await admin.page.getByText("se actualizaron 1 precios").waitFor();
});

await paso("importar desde CSV con validación y vista previa", async () => {
  const csv = "Nombre;Tipo;Categoría;Ley;Peso neto (g);Precio (fijo / gramo);Precio de lista;Cantidad\nAros perla importados;pieza única;Aros;Plata 925;2;fijo;45.000;1\nCadena importada;por cantidad;Cadenas;Plata 925;5;gramo;;6\nFila mala;pieza única;Inexistente;;;fijo;;1\n";
  await admin.page.goto(`${URL_BASE}/stock/importar`);
  await admin.page.locator('input[type="file"]').setInputFiles({ name: "piezas.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await admin.page.getByRole("button", { name: "Revisar el archivo" }).click();
  await admin.page.getByText("2 válidas").waitFor();
  await admin.page.getByText(/categoría «Inexistente» no existe/).waitFor();
  await foto(admin.page, "37-importar-pc", true);
  await admin.page.getByRole("button", { name: "Cargar las 2 filas válidas" }).click();
  await admin.page.getByText("Se cargaron 2 piezas.").waitFor();
});

await paso("stock a Excel y PDF; configuración de stock", async () => {
  for (const [f, firma] of [["xlsx", "PK"], ["pdf", "%PDF"]]) {
    const r = await admin.page.request.get(`${URL_BASE}/stock/exportar?formato=${f}`);
    verificar((await r.body()).subarray(0, firma.length).toString() === firma, `exportar ${f}`);
  }
  await admin.page.goto(`${URL_BASE}/configuracion/stock`);
  await foto(admin.page, "38-config-stock-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/configuracion/stock`);
  await sinDesborde(adminCelu.page);
});

console.log("Módulo 4 — clientes, proveedores y compras");
const manana = new Date(Date.now() + 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const ayer = new Date(Date.now() - 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
let idValeria = 0;
let idProv = 0;
let idCompra = 0;

await paso("clientes: listado y alta desde el celular (DNI y WhatsApp normalizados)", async () => {
  await admin.page.goto(`${URL_BASE}/clientes`);
  await admin.page.getByText("Laura Gómez (ejemplo)").waitFor();
  await foto(admin.page, "40-clientes-pc");
  const pg = adminCelu.page;
  await pg.goto(`${URL_BASE}/clientes/nuevo`);
  await pg.fill("#nombre", "Valeria Sosa");
  await pg.fill("#documento", "30.555.444");
  await pg.fill("#whatsapp", "341 15 444-5566");
  await pg.fill("#cumpleanos", "1990" + manana.slice(4));
  await pg.fill("#talles", "Anillo 13");
  await pg.fill("#preferencias", "Oro blanco, piezas delicadas");
  await sinDesborde(pg);
  await foto(pg, "41-alta-cliente-celular", true);
  await pg.getByRole("button", { name: "Dar de alta" }).click();
  await pg.getByText("Cliente dado de alta.").waitFor();
  idValeria = Number(pg.url().match(/clientes\/(\d+)/)[1]);
  verificar(/\+5493414445566/.test(await pg.locator("main").innerText()), "WhatsApp normalizado");
  verificar(/DNI 30555444/.test(await pg.locator("main").innerText()), "DNI sin puntos");
});

await paso("clientes: avisa si parece repetido", async () => {
  await admin.page.goto(`${URL_BASE}/clientes/nuevo`);
  await admin.page.fill("#nombre", "valeria sosa");
  await admin.page.getByRole("button", { name: "Dar de alta" }).click();
  await admin.page.getByText("No, es otra persona: dar de alta igual").waitFor();
  verificar((await admin.page.inputValue("#nombre")) === "valeria sosa", "no borra lo escrito");
});

await paso("cuenta corriente, deseos y recordatorios con WhatsApp listo", async () => {
  await admin.page.goto(`${URL_BASE}/clientes/${idValeria}`);
  await admin.page.getByText("Cargar saldo inicial o ajuste").click();
  await admin.page.fill("#ccImporte", "25.000");
  await admin.page.fill("#ccDesc", "Saldo del cuaderno (anillo de marzo)");
  await admin.page.fill("#ccVence", ayer);
  await admin.page.getByRole("button", { name: "Registrar", exact: true }).click();
  await admin.page.getByText("Debe $ 25.000").first().waitFor();
  const enlace = await admin.page.getByRole("link", { name: "Recordarle por WhatsApp" }).getAttribute("href");
  verificar(/^https:\/\/wa\.me\/5493414445566\?text=.*25\.000/.test(decodeURIComponent(enlace)), `enlace de WhatsApp: ${enlace}`);
  await admin.page.fill("#codigoDeseo", "ANI-0001");
  await admin.page.getByRole("button", { name: "Agregar" }).click();
  await admin.page.getByText("Agregado a la lista de deseos.").waitFor();
  await admin.page.reload();
  await foto(admin.page, "42-ficha-cliente-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/clientes/${idValeria}`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "42-ficha-cliente-celular", true);
  await admin.page.goto(`${URL_BASE}/clientes/recordatorios`);
  await admin.page.getByText("Mañana").first().waitFor();
  await admin.page.getByText("vencido $ 25.000").waitFor();
  await foto(admin.page, "43-recordatorios-pc", true);
  await adminCelu.page.goto(`${URL_BASE}/clientes/recordatorios`);
  await sinDesborde(adminCelu.page);
  await foto(adminCelu.page, "43-recordatorios-celular", true);
});

await paso("proveedores: CUIT validado y alta", async () => {
  await admin.page.goto(`${URL_BASE}/proveedores`);
  await admin.page.getByText("Taller Ríos (ejemplo)").waitFor();
  await foto(admin.page, "44-proveedores-pc");
  await admin.page.goto(`${URL_BASE}/proveedores/nuevo`);
  await admin.page.fill("#razonSocial", "Orfebres Unidos SRL");
  await admin.page.fill("#cuit", "20-12345678-5");
  await admin.page.getByLabel("Fabricante").check();
  await admin.page.getByLabel("Mayorista").check();
  await admin.page.fill("#diasPago", "30");
  await admin.page.getByRole("button", { name: "Dar de alta" }).click();
  verificar(/CUIT no es válido/.test(await alerta(admin.page)), "rechaza el CUIT inválido");
  await admin.page.fill("#cuit", "20-12345678-6");
  await admin.page.getByRole("button", { name: "Dar de alta" }).click();
  await admin.page.getByText("Proveedor dado de alta.").waitFor();
  idProv = Number(admin.page.url().match(/proveedores\/(\d+)/)[1]);
});

await paso("compra en dólares: pieza nueva, unidades de un artículo y metal por gramo", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/proveedores/compras/nueva?proveedor=${idProv}`);
  await pg.fill("#cPv", "2");
  await pg.fill("#cNum", "1500");
  await pg.selectOption("#cMon", "USD");
  await pg.fill("#cTc", "1.600");
  await pg.getByRole("button", { name: "+ Pieza nueva" }).click();
  await pg.fill("#n1", "Anillo con zafiro");
  await pg.selectOption("#c1", { label: "Anillos" });
  await pg.selectOption("#l1", { label: "Oro 18k" });
  await pg.fill("#g1", "3,5");
  await pg.fill("#co1", "450");
  await pg.fill("#pr1", "1.200.000");
  await pg.selectOption("#u1", { label: "Vitrina principal" });
  await pg.getByRole("button", { name: "+ Unidades de un artículo" }).click();
  await pg.fill("#cod2", "CAD-0001");
  await pg.locator("#q2").click();
  await pg.getByText("Cadena forzada 45 cm").waitFor();
  await pg.fill("#q2", "5");
  await pg.fill("#co2", "9");
  await pg.getByRole("button", { name: "+ Metal por gramo" }).click();
  await pg.selectOption("#l3", { label: "Oro 18k" });
  await pg.fill("#g3", "20");
  await pg.fill("#co3", "85");
  await pg.selectOption("#iva3", "0");
  // neto 450 + 45 + 1.700 = 2.195 · IVA 21 % sobre 495 = 103,95 · total 2.298,95
  await pg.getByText("USD 2.298,95").waitFor();
  await foto(pg, "45-nueva-compra-pc", true);
  await pg.getByRole("button", { name: "Registrar la compra" }).click();
  await pg.getByText("Compra registrada").waitFor();
  idCompra = Number(pg.url().match(/compras\/(\d+)/)[1]);
  await foto(pg, "46-detalle-compra-pc", true);
  await adminCelu.page.goto(pg.url());
  await sinDesborde(adminCelu.page);
  await pg.goto(`${URL_BASE}/stock?q=CAD-0001`);
  await pg.getByText("Cadena forzada 45 cm").click();
  await pg.getByText("18 u.").first().waitFor(); // 15 − 2 (ajuste del módulo 3) + 5
  await pg.goto(`${URL_BASE}/stock/metal`);
  await pg.getByText("20,00").first().waitFor();
  await foto(pg, "47-metal-propio-pc");
});

await paso("pago parcial imputado y saldo en dólares", async () => {
  const pg = adminCelu.page;
  await pg.goto(`${URL_BASE}/proveedores/${idProv}`);
  await pg.getByText("Le debemos USD 2.298,95").waitFor();
  await pg.selectOption("#pMoneda", "USD");
  await pg.getByRole("checkbox", { name: /Factura A 1500/ }).check();
  await pg.getByLabel(/Importe a imputar/).fill("1.000");
  await pg.fill("#pImporte", "1.000");
  await pg.getByRole("button", { name: "Registrar pago" }).click();
  await pg.getByText("Pago registrado.").waitFor();
  await pg.reload();
  await pg.getByText("Le debemos USD 1.298,95").waitFor();
  await sinDesborde(pg);
  await foto(pg, "48-ficha-proveedor-celular", true);
});

await paso("consignación entregada a una revendedora: la vendió y nos debe", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/proveedores/consignaciones`);
  await pg.selectOption("#terceroId", { label: "Ana Gómez, revendedora (ejemplo)" });
  await pg.getByPlaceholder("Buscar pieza…").fill("ALI-0001");
  await pg.getByRole("checkbox", { name: /ALI-0001/ }).check();
  await pg.getByLabel("Precio acordado ALI-0001").fill("900.000");
  await pg.getByRole("button", { name: /Entregar 1 pieza/ }).click();
  await pg.getByText("Se entregaron 1 pieza/s en consignación.").waitFor();
  await pg.reload();
  await pg.getByRole("button", { name: "La vendió" }).click();
  await pg.getByText("Vendida", { exact: true }).waitFor();
  await foto(pg, "49-consignaciones-pc", true);
  await pg.goto(`${URL_BASE}/proveedores?q=Ana`);
  await pg.getByText("Nos debe $ 900.000").waitFor();
  await pg.goto(`${URL_BASE}/proveedores/reposicion`);
  await pg.getByText("Bolsa de regalo con logo").waitFor();
  await foto(pg, "50-reposicion-pc");
});

await paso("la vendedora da de alta clientes pero no ve proveedores ni saldos de otros", async () => {
  const v = await nuevaPagina(CELU);
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  await v.page.getByRole("button", { name: "Abrir menú" }).click();
  const menu = v.page.getByRole("dialog", { name: "Menú" });
  verificar((await menu.getByText("Proveedores y compras").count()) === 0, "sin Proveedores en el menú");
  await v.page.goto(`${URL_BASE}/proveedores`);
  await v.page.waitForURL("**/sin-permiso");
  verificar((await v.page.request.get(`${URL_BASE}/api/v1/proveedores`)).status() === 403, "API proveedores 403");
  await v.page.goto(`${URL_BASE}/clientes/nuevo`);
  await v.page.fill("#nombre", "Cliente del mostrador");
  await v.page.getByRole("button", { name: "Dar de alta" }).click();
  await v.page.getByText("Cliente dado de alta.").waitFor();
  verificar((await v.page.getByText("Cargar saldo inicial o ajuste").count()) === 0, "no carga saldos");
  await v.page.goto(`${URL_BASE}/clientes/recordatorios`);
  verificar((await v.page.getByRole("heading", { name: "Saldos pendientes" }).count()) === 0, "no ve saldos de todos");
  await v.ctx.close();
});

await paso("anular la compra: primero los pagos; después se revierte stock, metal y deuda", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/proveedores/compras/${idCompra}`);
  await pg.fill("#motivo", "factura cargada dos veces");
  await pg.getByRole("button", { name: "Anular compra" }).click();
  verificar(/pagos imputados/.test(await alerta(pg)), "pide anular los pagos antes");
  await pg.goto(`${URL_BASE}/proveedores/${idProv}`);
  await pg.getByRole("button", { name: "Anular" }).first().click();
  await pg.waitForLoadState("networkidle");
  await pg.goto(`${URL_BASE}/proveedores/compras/${idCompra}`);
  await pg.fill("#motivo", "factura cargada dos veces");
  await pg.getByRole("button", { name: "Anular compra" }).click();
  await pg.getByText("Anulada: factura cargada dos veces").waitFor();
  await pg.goto(`${URL_BASE}/stock?q=CAD-0001`);
  await pg.getByText("Cadena forzada 45 cm").click();
  await pg.getByText("13 u.").first().waitFor();
});

console.log("Módulo 5 — ventas, señas, pedidos y reparaciones");
let idVenta1 = 0;
let idVenta2 = 0;
let codigoVendido = "";
const cobrarBtn = (pg) => pg.getByRole("button", { name: /^Cobrar \$/ });
const listo = (pg) => pg.getByRole("status").filter({ hasText: /registrada|confirmada/ }).waitFor();
async function elegirCliente(pg, nombre) {
  await pg.fill("[aria-label='Buscar cliente']", nombre.split(" ")[0]);
  await pg.getByRole("button", { name: new RegExp(nombre) }).first().click();
}

await paso("mostrador en computadora: escanear, cliente, cobro con efectivo y tarjeta en cuotas, comprobante y garantía en PDF", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/mostrador`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar pieza']", "veneciana");
  await pg.keyboard.press("Enter");
  await pg.getByRole("button", { name: "Agregar" }).first().waitFor();
  codigoVendido = (await pg.locator("main ul li p.text-xs").first().innerText()).trim();
  // El lector de códigos escribe el código y Enter: va directo a la venta.
  await pg.fill("[aria-label='Buscar pieza']", codigoVendido);
  await pg.keyboard.press("Enter");
  await pg.getByText("Cadena veneciana 50 cm").first().waitFor();
  await elegirCliente(pg, "Valeria Sosa");
  await cobrarBtn(pg).waitFor();
  await cobrarBtn(pg).click();
  const total = Number((await pg.getByTestId("total").innerText()).replace(/\D/g, ""));
  verificar(total > 0, "hay total");
  await pg.fill("[aria-label='Importe del pago 1']", String(Math.round(total / 2)));
  await pg.getByRole("button", { name: "+ Pagar con otro medio" }).click();
  await pg.selectOption("[aria-label='Medio de pago 2']", { label: "Tarjeta de crédito" });
  await pg.getByRole("button", { name: "3 cuotas" }).click();
  await pg.getByText("Cubierto").waitFor();
  await sinDesborde(pg);
  await foto(pg, "51-mostrador-cobro-pc", true);
  await pg.getByRole("button", { name: "Confirmar venta" }).click();
  await listo(pg);
  await foto(pg, "52-venta-registrada-pc");
  await pg.getByText(/Factura B .* autorizada \(simulada/).waitFor();
  await pg.getByRole("link", { name: "Factura (PDF)" }).waitFor();
  idVenta1 = Number((await pg.getByRole("link", { name: /Ver la venta/ }).getAttribute("href")).split("/").pop());
  for (const t of ["comprobante", "garantia", "remito"]) {
    const r = await pg.request.get(`${URL_BASE}/documentos/${t}/${idVenta1}`);
    verificar(r.status() === 200 && r.headers()["content-type"] === "application/pdf", `PDF ${t}`);
  }
  await pg.goto(`${URL_BASE}/ventas/${idVenta1}`);
  await pg.getByText("Tarjeta de crédito · 3 cuotas").waitFor();
  verificar((await pg.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).startsWith("https://wa.me/5493414445566"), "WhatsApp al cliente");
  await foto(pg, "53-ficha-venta-pc", true);
});

await paso("la pieza vendida ya no se puede vender otra vez", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/mostrador`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar pieza']", codigoVendido);
  await pg.keyboard.press("Enter");
  await pg.getByText(/No hay piezas disponibles/).waitFor();
});

await paso("celular: la vendedora vende con descuento mayor a su tope y lo autoriza un administrador", async () => {
  const v = await nuevaPagina(CELU);
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  const pg = v.page;
  await pg.goto(`${URL_BASE}/mostrador`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar pieza']", "argolla");
  await pg.keyboard.press("Enter");
  await pg.getByRole("button", { name: "Agregar" }).first().click();
  await pg.getByRole("link", { name: /Ver la venta/ }).waitFor();
  await sinDesborde(pg);
  await foto(pg, "54-mostrador-celular");
  await pg.fill("[aria-label='Descuento en porcentaje']", "25");
  await pg.getByText(/supera tu tope/).waitFor();
  await cobrarBtn(pg).click();
  await pg.getByRole("button", { name: "Confirmar venta" }).click();
  await pg.getByText(/Autorización de un administrador/).waitFor();
  await pg.fill("[aria-label='Usuario administrador']", "maria");
  await pg.fill("[aria-label='Contraseña del administrador']", "Castagno2026");
  await foto(pg, "55-autorizacion-celular", true);
  await pg.getByRole("button", { name: "Confirmar venta" }).click();
  await listo(pg);
  idVenta2 = Number((await pg.getByRole("link", { name: /Ver la venta/ }).getAttribute("href")).split("/").pop());
  await foto(pg, "56-venta-celular");
  await v.ctx.close();
});

await paso("reserva con seña y retiro usando la seña como pago", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/mostrador`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar pieza']", "sello");
  await pg.keyboard.press("Enter");
  await pg.getByRole("button", { name: "Agregar" }).first().click();
  await elegirCliente(pg, "Carlos Benítez");
  await pg.getByRole("button", { name: "Reservar" }).click();
  await pg.getByText("Deja seña").click();
  await pg.fill("[aria-label='Importe de la seña']", "50.000");
  await pg.getByRole("button", { name: "Confirmar reserva" }).click();
  await listo(pg);
  await pg.goto(`${URL_BASE}/ventas/reservas`);
  await pg.getByText("Seña $ 50.000").waitFor();
  await foto(pg, "57-reservas-pc");
  await pg.getByRole("link", { name: "Retira: cobrar" }).first().click();
  await pg.waitForLoadState("networkidle");
  await cobrarBtn(pg).click();
  await pg.selectOption("[aria-label='Medio de pago 1']", { label: "Saldo a favor / seña" });
  await pg.getByRole("button", { name: "+ Pagar con otro medio" }).click();
  await pg.getByText("Cubierto").waitFor();
  await pg.getByRole("button", { name: "Confirmar venta" }).click();
  await listo(pg);
});

let idRep = 0;
await paso("reparación: se recibe desde el celular con foto, pasa a lista y se cobra al entregar", async () => {
  const pg = adminCelu.page;
  await pg.goto(`${URL_BASE}/taller/nueva`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar cliente']", "Valeria");
  await pg.getByRole("button", { name: /Valeria Sosa/ }).first().click();
  await pg.fill("#descripcion", "Anillo de oro con piedra suelta");
  await pg.getByText("Engarzado").click();
  await pg.fill("#presupuesto", "15.000");
  await pg.locator('input[type="file"]').setInputFiles({ name: "rep.jpg", mimeType: "image/jpeg", buffer: fotoPrueba });
  await sinDesborde(pg);
  await foto(pg, "58-recibir-reparacion-celular", true);
  await pg.getByRole("button", { name: "Registrar reparación" }).click();
  await pg.waitForURL(/\/taller\/\d+\?aviso=creada/);
  idRep = Number(pg.url().match(/taller\/(\d+)/)[1]);
  await pg.locator("main img").first().waitFor();
  verificar((await pg.request.get(`${URL_BASE}/documentos/reparacion/${idRep}`)).status() === 200, "PDF de recepción");
  await pg.getByText("Lista", { exact: true }).click();
  await pg.getByRole("button", { name: "Guardar estado" }).click();
  await pg.getByRole("link", { name: "Cobrar y entregar" }).waitFor();
  await foto(pg, "59-reparacion-lista-celular", true);
  await pg.getByRole("link", { name: "Cobrar y entregar" }).click();
  await pg.waitForLoadState("networkidle");
  await cobrarBtn(pg).click();
  await pg.getByRole("button", { name: "Confirmar venta" }).click();
  await listo(pg);
  await pg.goto(`${URL_BASE}/taller/${idRep}`);
  await pg.getByText("Entregada").first().waitFor();
});

await paso("ficha del cliente: historial, garantías y cobro de la cuenta corriente", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/clientes/${idValeria}`);
  await pg.getByText(/Reparación N.º \d+: Anillo de oro con piedra suelta/).waitFor();
  await pg.getByText("Registrar un pago", { exact: true }).click();
  await pg.getByRole("button", { name: "Registrar pago" }).click();
  await pg.getByText(/Cobro registrado/).waitFor();
  await foto(pg, "61-ficha-cliente-pc", true);
});

await paso("pedido a medida con seña: queda aprobado y con su orden en PDF", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/taller/pedidos/nuevo`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar cliente']", "Valeria");
  await pg.getByRole("button", { name: /Valeria Sosa/ }).first().click();
  await pg.fill("#descripcion", "Anillo de compromiso oro blanco con circón");
  await pg.fill("#presupuesto", "300.000");
  await pg.getByText("Deja seña (queda aprobado)").click();
  await pg.fill("[aria-label='Importe de la seña']", "100.000");
  await pg.getByRole("button", { name: "Registrar pedido" }).click();
  await pg.waitForURL(/\/taller\/pedidos\/\d+/);
  await pg.getByText("Aprobado").first().waitFor();
  await pg.getByText("$ 100.000").first().waitFor();
  await foto(pg, "60-pedido-pc", true);
  await pg.goto(`${URL_BASE}/clientes/${idValeria}`);
  await pg.getByText(/Pedido N.º \d+/).first().waitFor();
  await pg.getByText(/Incluye señas/).waitFor();
});

await paso("devolución con vale de cambio y anulación de venta", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/ventas/${idVenta1}`);
  await pg.getByText("Devolución o cambio").click();
  await pg.getByRole("checkbox", { name: /Devolver/ }).first().check();
  await pg.fill("[aria-label='Motivo de la devolución']", "cambio de talle");
  await pg.getByRole("button", { name: "Registrar devolución" }).click();
  await pg.getByText("Devoluciones y cambios").waitFor();
  await pg.reload();
  await pg.getByText(/VL-[A-Z0-9]/).first().waitFor();
  await pg.goto(`${URL_BASE}/ventas/${idVenta2}`);
  await pg.locator("summary", { hasText: "Anular la venta" }).click();
  await pg.fill("[aria-label='Motivo de la anulación']", "se cargó mal");
  // La venta está facturada (modo simulado): se anula con nota de crédito.
  await pg.locator("form").getByRole("button", { name: /Anular/ }).click();
  await pg.getByText("Anulada: se cargó mal").waitFor();
  await pg.goto(`${URL_BASE}/ventas/vales`);
  await pg.getByText("Vale de cambio").first().waitFor();
});

await paso("listados de ventas, taller y configuración de medios de cobro (computadora y celular)", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/configuracion/ventas`);
  const fila = pg.locator("form").filter({ has: pg.locator("input[value='Tarjeta de crédito']") }).first();
  await fila.locator("[aria-label='Recargo o descuento %']").fill("10");
  await fila.getByRole("button", { name: "Guardar" }).click();
  await pg.getByText("Medio actualizado.").waitFor();
  await foto(pg, "62-config-medios-pc", true);
  await pg.goto(`${URL_BASE}/ventas`);
  await foto(pg, "63-ventas-pc", true);
  for (const r of ["/ventas", "/ventas/reservas", "/taller", "/taller/pedidos", "/"]) {
    await adminCelu.page.goto(`${URL_BASE}${r}`);
    await sinDesborde(adminCelu.page);
  }
  await adminCelu.page.goto(`${URL_BASE}/ventas`);
  await foto(adminCelu.page, "64-ventas-celular", true);
  await adminCelu.page.goto(`${URL_BASE}/taller`);
  await foto(adminCelu.page, "65-taller-celular", true);
});

console.log("Módulo 6 — tesorería");
const hoyAr = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

await paso("tesorería: lo cobrado en el mostrador ya está en cada caja; saldo inicial del banco", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/tesoreria`);
  await pg.getByText("Caja efectivo pesos").first().waitFor();
  await pg.getByText("Tarjetas a acreditar").first().waitFor();
  verificar(/Disponible hoy/.test(await pg.locator("main").innerText()), "muestra el disponible");
  await pg.goto(`${URL_BASE}/tesoreria/cajas`);
  await pg.fill("#si-" + (await pg.locator("label", { hasText: "Banco (cuenta corriente)" }).first().getAttribute("for")).split("-")[1], "500.000");
  await pg.locator("form", { has: pg.locator("label", { hasText: "Banco (cuenta corriente)" }) }).getByRole("button", { name: "Cargar" }).click();
  await pg.getByText("Saldo inicial cargado.").waitFor();
  verificar((await pg.locator('label[for^="si-"]', { hasText: "Banco (cuenta corriente)" }).count()) === 0, "ya no pide el saldo inicial del banco");
  await foto(pg, "66-cajas-pc", true);
});

await paso("gasto con categoría, transferencia y compra de dólares", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/tesoreria`);
  await pg.waitForLoadState("networkidle");
  await pg.selectOption("#opCaja", { label: "Banco (cuenta corriente) (ARS)" });
  await pg.selectOption("#opCat", { label: "Alquiler" });
  await pg.fill("#opImp", "100.000");
  await pg.fill("#opDesc", "Alquiler del local");
  await pg.getByRole("button", { name: "Registrar" }).click();
  await pg.getByText("Gasto registrado.").waitFor();
  await pg.getByRole("tab", { name: "Transferencia" }).click();
  await pg.selectOption("#opOrig", { label: "Caja efectivo pesos (ARS)" });
  await pg.selectOption("#opDest", { label: "Banco (cuenta corriente) (ARS)" });
  await pg.fill("#opImp", "10.000");
  await pg.getByRole("button", { name: "Registrar" }).click();
  await pg.getByText("Transferencia registrada.").waitFor();
  await pg.getByRole("tab", { name: "Compra / venta de divisas" }).click();
  await pg.selectOption("#opOrig", { label: "Caja efectivo pesos (ARS)" });
  await pg.selectOption("#opDest", { label: "Caja efectivo dólares (USD)" });
  await pg.fill("#opImpO", "110.000");
  await pg.fill("#opImpD", "100");
  await pg.getByRole("button", { name: "Registrar" }).click();
  await pg.getByText(/cambio 1\.100/).waitFor();
  await sinDesborde(pg);
  await foto(pg, "67-tesoreria-pc", true);
  await pg.goto(`${URL_BASE}/tesoreria/movimientos?tipo=gasto`);
  await pg.getByText("Alquiler del local").waitFor();
});

await paso("caja del día desde el celular: la vendedora abre con un faltante y el administrador recibe el aviso", async () => {
  const v = await nuevaPagina(CELU);
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  await v.page.goto(`${URL_BASE}/caja`);
  verificar((await v.page.getByText("Tendría que haber").count()) === 0, "la vendedora no ve lo esperado");
  await v.page.getByLabel("Efectivo contado en la apertura").first().fill("0");
  await v.page.getByRole("button", { name: "Abrir caja" }).first().click();
  await v.page.getByText(/faltaban \$/).waitFor();
  await sinDesborde(v.page);
  await foto(v.page, "68-caja-del-dia-celular", true);
  await v.page.goto(`${URL_BASE}/tesoreria`);
  await v.page.waitForURL("**/sin-permiso");
  verificar((await v.page.request.get(`${URL_BASE}/api/v1/tesoreria/cajas`)).status() === 403, "API tesorería 403");
  await v.ctx.close();
  await admin.page.goto(`${URL_BASE}/alertas`);
  await admin.page.getByText(/Faltante de \$/).first().waitFor();
});

await paso("tarjetas: la liquidación pasa el neto al banco y la comisión queda como gasto", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/tesoreria/tarjetas`);
  await pg.getByRole("button", { name: "Todos" }).click();
  const bruto = Number((await pg.getByText(/Cupones elegidos/).innerText()).split(",")[0].replace(/\D/g, ""));
  await pg.fill("#acNeto", String(Math.floor(bruto * 0.95)).replace(".", ","));
  await pg.fill("#acRet", String(Math.floor(bruto * 0.01)));
  await pg.getByText(/Comisión de la procesadora/).waitFor();
  await foto(pg, "69-tarjetas-pc", true);
  await pg.getByRole("button", { name: "Registrar acreditación" }).click();
  await pg.getByText(/Acreditación registrada/).waitFor();
  await pg.getByText("No hay cobros con tarjeta pendientes de acreditar.").waitFor();
  await pg.goto(`${URL_BASE}/tesoreria/movimientos?tipo=gasto`);
  await pg.getByText(/Comisión de la procesadora/).first().waitFor();
});

await paso("cheques: se recibe de una clienta, se deposita; al proveedor se le paga con cheque propio que después se debita", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/tesoreria/cheques?cliente=${idValeria}`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("#chNum", "00123456");
  await pg.fill("#chBanco", "Banco Nación");
  await pg.fill("#chImp", "50.000");
  await pg.getByRole("button", { name: "Recibir cheque" }).click();
  await pg.getByText("Cheque recibido: quedó en la cartera.").waitFor();
  await pg.getByRole("button", { name: "Depositar" }).first().click();
  await pg.getByRole("button", { name: "Confirmar" }).click();
  await pg.getByText(/Cheque depositado/).waitFor();
  await pg.goto(`${URL_BASE}/proveedores/${idProv}`);
  await pg.waitForLoadState("networkidle");
  if (!(await pg.locator("#pMoneda").isVisible())) await pg.locator("summary", { hasText: "Registrar un pago" }).click();
  await pg.selectOption("#pMoneda", "ARS");
  await pg.fill("#pImporte", "80.000");
  await pg.selectOption("#oMedio", "cheque");
  await pg.getByText("Cheque propio").click();
  await pg.fill("#oChNum", "A-0001");
  await pg.fill("#oChFecha", new Date(Date.now() + 15 * 86400_000).toLocaleDateString("en-CA"));
  await pg.getByRole("button", { name: "Registrar pago" }).click();
  await pg.getByText("Pago registrado.").waitFor();
  await pg.goto(`${URL_BASE}/tesoreria/cheques?ver=propios`);
  await pg.getByText("N.º A-0001").waitFor();
  await foto(pg, "70-cheques-pc", true);
  await pg.getByRole("button", { name: "Se debitó del banco" }).click();
  await pg.getByText(/Débito registrado/).waitFor();
});

await paso("flujo de fondos y conciliación bancaria con el extracto", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/tesoreria/flujo`);
  await pg.getByText("Disponible hoy").waitFor();
  await foto(pg, "71-flujo-pc", true);
  await pg.goto(`${URL_BASE}/tesoreria/conciliacion`);
  const csv = `Fecha;Concepto;Débito;Crédito\n${hoyAr};PAGO ALQUILER;100.000,00;\n${hoyAr};COMISION MANTENIMIENTO CUENTA;3.500,00;\n`;
  await pg.locator('input[type="file"]').setInputFiles({ name: "extracto.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await pg.getByRole("button", { name: "Subir y comparar" }).click();
  await pg.getByText(/1 de 2 renglones coinciden/).waitFor();
  await pg.getByRole("button", { name: "Confirmar conciliación" }).click();
  await pg.getByText(/Conciliación guardada/).waitFor();
  await pg.reload();
  await pg.getByText("COMISION MANTENIMIENTO CUENTA").waitFor();
  await foto(pg, "72-conciliacion-pc", true);
  await pg.getByRole("button", { name: "Registrar" }).first().click();
  await pg.waitForLoadState("networkidle");
  await pg.reload();
  verificar((await pg.getByText("COMISION MANTENIMIENTO CUENTA").count()) === 0, "el renglón quedó registrado");
});

await paso("tesorería en el celular sin desbordes", async () => {
  const pg = adminCelu.page;
  for (const r of ["/tesoreria", "/tesoreria/movimientos", "/tesoreria/tarjetas", "/tesoreria/cheques", "/tesoreria/flujo", "/tesoreria/conciliacion", "/tesoreria/arqueos", "/tesoreria/cajas", "/caja"]) {
    await pg.goto(`${URL_BASE}${r}`);
    await sinDesborde(pg);
  }
  await pg.goto(`${URL_BASE}/tesoreria`);
  await foto(pg, "73-tesoreria-celular", true);
  await pg.goto(`${URL_BASE}/tesoreria/flujo`);
  await foto(pg, "74-flujo-celular", true);
});

console.log("Módulo 7 — facturación electrónica y ventas sin facturar");

await paso("la venta del mostrador sale con factura B (simulada) y su PDF con el QR", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/ventas/${idVenta1}`);
  await pg.getByText(/Factura B 00001-\d{8}/).first().waitFor();
  await pg.getByText("Autorizada").first().waitFor();
  const href = await pg.getByRole("link", { name: "Factura", exact: true }).getAttribute("href");
  const r = await pg.request.get(`${URL_BASE}${href}`);
  verificar(r.status() === 200 && r.headers()["content-type"] === "application/pdf", "PDF de la factura");
  await pg.getByText(/Nota de crédito B/).first().waitFor(); // de la devolución del módulo 5
  await foto(pg, "75-venta-facturada-pc", true);
  await pg.goto(`${URL_BASE}/facturacion`);
  await pg.getByText(/Modo SIMULADO/).waitFor();
  await foto(pg, "76-facturacion-pc", true);
});

await paso("venta sin facturar y facturada después sin mover stock ni caja", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/mostrador`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar pieza']", "Dije");
  await pg.keyboard.press("Enter");
  await pg.getByRole("button", { name: "Agregar" }).first().click();
  await cobrarBtn(pg).waitFor();
  await cobrarBtn(pg).click();
  await pg.getByText("Sin facturar (interno)").click();
  await pg.getByRole("button", { name: "Confirmar venta" }).click();
  await listo(pg);
  verificar((await pg.getByText(/autorizada/).count()) === 0, "una venta interna no se factura");
  const idInterna = Number((await pg.getByRole("link", { name: /Ver la venta/ }).getAttribute("href")).split("/").pop());
  await pg.goto(`${URL_BASE}/facturacion/sin-facturar`);
  await pg.getByText(/1 venta\/s/).first().waitFor();
  await foto(pg, "77b-sin-facturar-pc", true);
  await pg.getByRole("button", { name: "Facturar ahora" }).first().click();
  await pg.getByText("No hay ventas sin facturar en esas fechas.").waitFor();
  await pg.goto(`${URL_BASE}/ventas/${idInterna}`);
  await pg.getByText("Facturada").first().waitFor();
  await pg.getByText("Autorizada").first().waitFor();
});

await paso("nota de débito a una clienta y libros IVA en Excel", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/facturacion/nota-debito`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("[aria-label='Buscar cliente']", "Valeria");
  await pg.getByRole("button", { name: /Valeria Sosa/ }).first().click();
  await pg.fill("#ndConcepto", "Intereses por pago fuera de término");
  await pg.fill("#ndImporte", "1.210");
  await pg.getByRole("button", { name: "Emitir nota de débito" }).click();
  await pg.getByText(/Nota de débito B .* autorizada/).waitFor();
  await pg.goto(`${URL_BASE}/facturacion/libros`);
  await pg.getByText(/IVA Ventas \(\d+ comprobantes\)/).waitFor();
  const r = await pg.request.get(`${URL_BASE}/facturacion/libros/descargar?libro=ventas&mes=${new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7)}`);
  verificar(r.status() === 200 && (await r.body()).length > 1000, "Excel del libro IVA ventas");
  await foto(pg, "77-libros-iva-pc", true);
});

await paso("configuración ARCA: datos fiscales, punto de venta y pedido del certificado", async () => {
  const pg = admin.page;
  await pg.goto(`${URL_BASE}/facturacion/configuracion`);
  await pg.waitForLoadState("networkidle");
  await pg.fill("#fRs", "María Castagno Joyas");
  await pg.fill("#fCuit", "20111111112");
  await pg.fill("#fIibb", "921-123456-7");
  await pg.getByRole("button", { name: "Guardar", exact: true }).first().click();
  await pg.getByText("Datos fiscales guardados.").waitFor();
  const descarga = pg.waitForEvent("download");
  await pg.getByRole("button", { name: "Generar pedido (.csr)" }).first().click();
  const d = await descarga;
  verificar(d.suggestedFilename() === "pedido-homologacion.csr", "descarga el pedido de certificado");
  await pg.getByText(/Se descargó el pedido/).waitFor();
  await foto(pg, "78-config-arca-pc", true);
});

await paso("facturación en el celular sin desbordes y la vendedora no entra", async () => {
  for (const r of ["/facturacion", "/facturacion/pendientes", "/facturacion/sin-facturar", "/facturacion/nota-debito", "/facturacion/libros", "/facturacion/configuracion", `/ventas/${idVenta1}`]) {
    await adminCelu.page.goto(`${URL_BASE}${r}`);
    await sinDesborde(adminCelu.page);
  }
  await foto(adminCelu.page, "79-venta-facturada-celular", true);
  const v = await nuevaPagina(CELU);
  await ingresar(v.page, "lucia", "Mostrador2026");
  await v.page.waitForURL(`${URL_BASE}/`);
  await v.page.goto(`${URL_BASE}/facturacion`);
  await v.page.waitForURL("**/sin-permiso");
  await v.ctx.close();
});

await paso("quitar los datos de ejemplo (piezas, clientes y proveedores) sin tocar lo real", async () => {
  await admin.page.goto(`${URL_BASE}/configuracion/stock`);
  await admin.page.getByRole("button", { name: "Quitar los datos de ejemplo" }).click();
  await admin.page.getByText(/se quitaron los datos de ejemplo/).waitFor();
  await admin.page.goto(`${URL_BASE}/stock`);
  verificar((await admin.page.getByText("Ejemplo", { exact: true }).count()) === 0, "ya no hay piezas de ejemplo");
  await admin.page.getByText("Anillo de compromiso (prueba)").waitFor();
  await admin.page.goto(`${URL_BASE}/clientes`);
  verificar((await admin.page.getByText("(ejemplo)").count()) === 0, "ya no hay clientes de ejemplo");
  await admin.page.getByText("Valeria Sosa").waitFor();
  await admin.page.goto(`${URL_BASE}/proveedores`);
  await admin.page.getByText("Orfebres Unidos SRL").waitFor();
});

await paso("sin errores en la consola del navegador", async () => {
  verificar(errores.length === 0, errores.join(" | "));
});

await navegador.close();
apagar();
console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : `\nTodo bien. Capturas en ${CAPTURAS}`);
process.exit(fallas ? 1 : 0);

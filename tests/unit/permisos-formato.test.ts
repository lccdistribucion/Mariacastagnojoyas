import assert from "node:assert/strict";
import { test } from "node:test";
import { fecha, fechaHora, leerNumero, numero, pesos, porcentaje } from "../../src/lib/formato";
import { PERMISOS, permisosEfectivos } from "../../src/lib/permisos";

test("formato argentino: fechas dd/mm/aaaa en hora de Argentina", () => {
  const d = new Date("2026-11-17T02:30:00Z"); // 23:30 del 16/11 en Argentina
  assert.equal(fecha(d), "16/11/2026");
  assert.equal(fechaHora(d), "16/11/2026 23:30");
});

test("formato argentino: coma decimal y punto de miles", () => {
  assert.equal(numero(1234567.891), "1.234.567,89");
  assert.equal(pesos(123456), "$ 1.234,56");
  assert.equal(porcentaje(1050), "10,50 %");
  assert.equal(porcentaje(1000), "10 %");
  assert.equal(leerNumero("1.234,56"), 1234.56);
  assert.equal(leerNumero("10,5"), 10.5);
  assert.equal(leerNumero("10.5"), 10.5);
  assert.equal(leerNumero("abc"), null);
  assert.equal(leerNumero("1.560"), 1560, "punto de miles, como se escribe en Argentina");
  assert.equal(leerNumero("1.234.567"), 1234567);
  assert.equal(leerNumero("1.5"), 1.5);
  assert.equal(leerNumero("3846.60"), 3846.6);
});

test("el administrador tiene todos los permisos y no se le pueden quitar", () => {
  const p = permisosEfectivos("admin", [{ permiso: "ver_costos", concedido: false }]);
  assert.equal(p.size, Object.keys(PERMISOS).length);
  assert.ok(p.has("ver_costos"));
});

test("el usuario no tiene permisos especiales salvo los delegables que le den", () => {
  assert.equal(permisosEfectivos("usuario").size, 0);
  const p = permisosEfectivos("usuario", [
    { permiso: "ver_sin_facturar", concedido: true },
    { permiso: "gestionar_usuarios", concedido: true }, // no delegable: se ignora
  ]);
  assert.ok(p.has("ver_sin_facturar"));
  assert.ok(!p.has("gestionar_usuarios"));
});

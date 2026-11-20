/**
 * Importación masiva de piezas desde Excel (.xlsx) o CSV. Primero se valida fila por fila y se muestra una
 * vista previa con los errores; al confirmar se cargan TODAS las filas válidas juntas (una sola transacción).
 */
import ExcelJS from "exceljs";
import { categorias, db, leyesMetal, ubicaciones } from "@/db";
import { auditar, type Actor } from "../auditoria";
import { ErrorValidacion } from "../config";
import { leerNumero } from "../formato";
import { crearProducto, esquemaProducto, type DatosProducto } from "./productos";
import { ORIGENES, TIPOS } from "./tipos";

/** Columnas de la plantilla (en este orden). */
export const COLUMNAS = [
  ["codigo", "Código (vacío = automático)"],
  ["nombre", "Nombre *"],
  ["tipo", "Tipo (pieza única / por cantidad / insumo / packaging)"],
  ["categoria", "Categoría"],
  ["coleccion", "Colección"],
  ["artesano", "Diseñador / artesano"],
  ["ley", "Ley (como en Configuración, ej. Oro 18k)"],
  ["metal_detalle", "Metal / terminación (acero, baño de oro…)"],
  ["peso_bruto", "Peso bruto (g)"],
  ["peso_neto", "Peso neto (g)"],
  ["medidas", "Medidas"],
  ["talle", "Talle"],
  ["modo_precio", "Precio (fijo / gramo)"],
  ["precio_lista", "Precio de lista"],
  ["precio_oferta", "Precio de oferta"],
  ["moneda_precio", "Moneda del precio (ARS/USD/EUR)"],
  ["hechura", "Hechura $ (precio por gramo)"],
  ["costo_metal", "Costo metal"],
  ["costo_mano_obra", "Costo mano de obra"],
  ["costo_piedras", "Costo piedras"],
  ["costo_otros", "Costo otros"],
  ["moneda_costo", "Moneda del costo"],
  ["iva", "IVA % (21 / 10,5 / 0)"],
  ["origen", "Origen (compra / consignación / fabricación / canje / inventario)"],
  ["consignante", "Consignante"],
  ["ubicacion", "Ubicación"],
  ["cantidad", "Cantidad"],
  ["stock_minimo", "Stock mínimo"],
  ["descripcion", "Descripción"],
] as const;

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Lee un .xlsx o .csv y devuelve las filas como objetos {columna: texto}. */
/** Lee un .csv o .xlsx como una matriz de textos (la primera hoja del Excel). Lo usan también otros importadores. */
export async function leerMatriz(nombre: string, contenido: Buffer): Promise<string[][]> {
  let matriz: string[][];
  if (/\.csv$/i.test(nombre) || /\.txt$/i.test(nombre)) {
    const texto = contenido.toString("utf8").replace(/^﻿/, "");
    const sep = (texto.split("\n")[0].match(/;/g)?.length ?? 0) >= (texto.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    matriz = parsearCsv(texto, sep);
  } else if (/\.xlsx$/i.test(nombre)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(contenido as unknown as ArrayBuffer);
    } catch {
      throw new ErrorValidacion("No se pudo leer el Excel. Guardalo como .xlsx y probá de nuevo.");
    }
    const ws = wb.worksheets[0];
    matriz = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = row.getCell(c).value;
        vals.push(v == null ? "" : typeof v === "object" && "text" in v ? String(v.text) : typeof v === "object" && "result" in v ? String(v.result ?? "") : String(v));
      }
      matriz.push(vals);
    });
  } else throw new ErrorValidacion("Subí un archivo .xlsx (Excel) o .csv.");
  return matriz;
}

export async function leerArchivo(nombre: string, contenido: Buffer): Promise<Record<string, string>[]> {
  const matriz = await leerMatriz(nombre, contenido);

  // La fila de encabezados es la primera que contiene «nombre».
  const iEnc = matriz.findIndex((f) => f.some((c) => ["nombre", "nombre *"].includes(norm(c))));
  if (iEnc < 0) throw new ErrorValidacion("No encontré la fila de encabezados (tiene que tener una columna «Nombre»). Usá la plantilla.");
  const encabezados = matriz[iEnc].map((c) => {
    const n = norm(c);
    const col = COLUMNAS.find(([k, t]) => n === k || n === norm(t) || n === norm(t.split(" (")[0]) || n.replace(/ /g, "_") === k);
    return col?.[0] ?? null;
  });
  return matriz
    .slice(iEnc + 1)
    .filter((f) => f.some((c) => String(c).trim()))
    // Las filas de ejemplo de la plantilla se ignoran aunque no las borren.
    .filter((f) => !f.some((c) => /\(ejemplo\)/i.test(String(c))))
    .map((f) => Object.fromEntries(encabezados.map((k, i) => [k, String(f[i] ?? "").trim()]).filter(([k]) => k)) as Record<string, string>);
}

function parsearCsv(texto: string, sep: string) {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

export type FilaImportada = { fila: number; codigo: string; nombre: string; datos: DatosProducto | null; errores: string[] };

/** Valida las filas y arma los datos de cada pieza (sin guardar nada). */
export async function validarFilas(filas: Record<string, string>[]): Promise<FilaImportada[]> {
  const [cats, leyes, ubis] = await Promise.all([db.select().from(categorias), db.select().from(leyesMetal), db.select().from(ubicaciones)]);
  const vistos = new Set<string>();
  return filas.map((f, i) => {
    const errores: string[] = [];
    const num = (k: string) => {
      const v = f[k];
      if (!v) return null;
      const n = leerNumero(v);
      if (n == null || n < 0) errores.push(`«${k}» no es un número válido (${v})`);
      return n;
    };
    const plata = (k: string) => {
      const n = num(k);
      return n == null ? null : Math.round(n * 100);
    };
    const gramosAMg = (k: string) => {
      const n = num(k);
      return n == null ? null : Math.round(n * 1000);
    };
    const buscar = <T extends { nombre: string }>(lista: T[], valor: string | undefined, que: string) => {
      if (!valor) return null;
      const x = lista.find((y) => norm(y.nombre) === norm(valor));
      if (!x) errores.push(`${que} «${valor}» no existe`);
      return x ?? null;
    };
    const tipoTxt = norm(f.tipo);
    const tipo = (Object.keys(TIPOS) as (keyof typeof TIPOS)[]).find((k) => k === tipoTxt || norm(TIPOS[k]) === tipoTxt || (tipoTxt.includes("cantidad") && k === "cantidad") || (tipoTxt.includes("unica") && k === "unica")) ?? (tipoTxt ? null : "unica");
    if (!tipo) errores.push(`tipo «${f.tipo}» no válido`);
    const origenTxt = norm(f.origen);
    const origen = (Object.keys(ORIGENES) as (keyof typeof ORIGENES)[]).find((k) => k === origenTxt || norm(ORIGENES[k]).startsWith(origenTxt)) ?? (origenTxt ? null : "inventario");
    if (!origen) errores.push(`origen «${f.origen}» no válido`);
    const moneda = (k: string) => {
      const m = (f[k] || "ARS").toUpperCase().replace("$", "ARS").replace("U$S", "USD").replace("US$", "USD");
      if (!["ARS", "USD", "EUR"].includes(m)) errores.push(`moneda «${f[k]}» no válida`);
      return m as "ARS" | "USD" | "EUR";
    };
    const ivaN = f.iva ? leerNumero(f.iva) : 21;
    const iva = ivaN == null ? 2100 : Math.round(ivaN * 100);
    const ley = buscar(leyes, f.ley, "La ley");
    const cat = buscar(cats, f.categoria, "La categoría");
    const ubi = buscar(ubis, f.ubicacion, "La ubicación");
    const modo = norm(f.modo_precio).startsWith("gram") ? "gramo" : "fijo";
    const datos: DatosProducto = {
      codigo: f.codigo ?? "",
      codigoBarras: null,
      nombre: f.nombre ?? "",
      tipo: tipo ?? "unica",
      categoriaId: cat?.id ?? null,
      coleccion: f.coleccion || null,
      artesano: f.artesano || null,
      leyId: ley?.id ?? null,
      metalDetalle: f.metal_detalle || null,
      pesoBrutoMg: gramosAMg("peso_bruto"),
      pesoNetoMg: gramosAMg("peso_neto"),
      medidas: f.medidas || null,
      talle: f.talle || null,
      descripcion: f.descripcion || null,
      notasInternas: null,
      costoMetal: plata("costo_metal") ?? 0,
      costoManoObra: plata("costo_mano_obra") ?? 0,
      costoPiedras: plata("costo_piedras") ?? 0,
      costoOtros: plata("costo_otros") ?? 0,
      monedaCosto: moneda("moneda_costo"),
      modoPrecio: modo,
      precioLista: plata("precio_lista") ?? 0,
      precioOferta: plata("precio_oferta"),
      monedaPrecio: moneda("moneda_precio"),
      hechura: plata("hechura") ?? 0,
      ivaPct: iva,
      origen: origen ?? "inventario",
      consignante: f.consignante || null,
      ubicacionId: ubi?.id ?? null,
      cantidad: num("cantidad") ?? 1,
      stockMinimo: num("stock_minimo") ?? 0,
      piedras: [],
    };
    const r = esquemaProducto.safeParse(datos);
    if (!r.success) for (const iss of r.error.issues) if (!errores.includes(iss.message)) errores.push(iss.message);
    const codigo = (f.codigo ?? "").toUpperCase();
    if (codigo) {
      if (vistos.has(codigo)) errores.push(`el código ${codigo} está repetido en el archivo`);
      vistos.add(codigo);
    }
    return { fila: i + 2, codigo, nombre: f.nombre ?? "", datos: errores.length ? null : datos, errores };
  });
}

/** Carga todas las filas válidas juntas. Si una falla (por ejemplo, un código que ya existe), no se carga ninguna. */
export async function importar(filas: FilaImportada[], actor: Actor, nombreArchivo: string) {
  const validas = filas.filter((f) => f.datos);
  if (!validas.length) throw new ErrorValidacion("No hay filas válidas para cargar.");
  await db.transaction(async (tx) => {
    for (const f of validas) {
      try {
        await crearProducto(f.datos!, actor, { tx });
      } catch (e) {
        throw new ErrorValidacion(`Fila ${f.fila} (${f.nombre}): ${e instanceof Error ? e.message : e}. No se cargó ninguna fila.`);
      }
    }
    await auditar(tx, actor, { accion: "alta", entidad: "producto", descripcion: `Importó ${validas.length} piezas desde «${nombreArchivo}»` });
  });
  return validas.length;
}

/** Plantilla de Excel con encabezados, dos ejemplos y una hoja de ayuda con los valores válidos. */
export async function plantilla() {
  const [cats, leyes, ubis] = await Promise.all([db.select().from(categorias), db.select().from(leyesMetal), db.select().from(ubicaciones)]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Piezas");
  ws.addRow(COLUMNAS.map(([, t]) => t));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141414" } };
  ws.addRow(["", "Anillo solitario (ejemplo)", "pieza única", "Anillos", "Clásica", "", "Oro 18k", "", "3,2", "2,9", "", "14", "fijo", "450000", "", "ARS", "", "", "", "", "", "ARS", "21", "inventario", "", "Vitrina principal", "1", "", "Borrar esta fila"]);
  ws.addRow(["", "Cadena plata 45 cm (ejemplo)", "por cantidad", "Cadenas", "", "", "Plata 925", "", "", "4,5", "45 cm", "", "gramo", "", "", "ARS", "8000", "", "", "", "", "ARS", "21", "compra", "", "Vitrina 2", "10", "3", "Borrar esta fila"]);
  COLUMNAS.forEach((_, i) => (ws.getColumn(i + 1).width = 18));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const ayuda = wb.addWorksheet("Valores válidos");
  ayuda.addRow(["Categorías", "Leyes", "Ubicaciones", "Tipos", "Origen"]);
  ayuda.getRow(1).font = { bold: true };
  const largo = Math.max(cats.length, leyes.length, ubis.length, 5);
  const tipos = Object.values(TIPOS);
  const origenes = Object.values(ORIGENES);
  for (let i = 0; i < largo; i++) ayuda.addRow([cats[i]?.nombre ?? "", leyes[i]?.nombre ?? "", ubis[i]?.nombre ?? "", tipos[i] ?? "", origenes[i] ?? ""]);
  ayuda.columns.forEach((c) => (c.width = 26));
  ayuda.addRow([]);
  ayuda.addRow(["Pesos en gramos con coma decimal (3,25). Precios y costos en la moneda indicada. Precio «gramo»: peso neto × gramo de la ley + hechura."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

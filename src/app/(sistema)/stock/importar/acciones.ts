"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { importar, leerArchivo, validarFilas } from "@/lib/stock/importar";

/** Valida el archivo (`confirmar` = vacío) o lo carga (`confirmar` = "1"). Las filas no se guardan entre pasos: se vuelve a leer el archivo. */
export async function accionImportar(_p: unknown, f: FormData) {
  const u = await requierePermiso("cargar_productos");
  const archivo = f.get("archivo");
  if (!(archivo instanceof File) || !archivo.size) return { error: "Elegí un archivo." };
  if (archivo.size > 8 * 1024 * 1024) return { error: "El archivo es demasiado grande (máximo 8 MB)." };
  try {
    const filas = await validarFilas(await leerArchivo(archivo.name, Buffer.from(await archivo.arrayBuffer())));
    const vista = filas.map((x) => ({ fila: x.fila, codigo: x.codigo, nombre: x.nombre, errores: x.errores }));
    if (f.get("confirmar") !== "1") return { vista, nombreArchivo: archivo.name };
    const n = await importar(filas, await actorDe(u), archivo.name);
    revalidatePath("/stock");
    return { ok: `Se cargaron ${n} piezas.${filas.length > n ? ` Quedaron ${filas.length - n} filas con errores sin cargar.` : ""}` };
  } catch (e) {
    if (e instanceof ErrorValidacion) return { error: e.message };
    throw e;
  }
}

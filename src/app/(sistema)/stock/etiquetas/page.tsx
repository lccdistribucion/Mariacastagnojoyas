import { Encabezado, Tarjeta } from "@/components/ui";
import { requiereUsuario } from "@/lib/auth/sesion";
import { leerConfig } from "@/lib/config";
import { listarStock } from "@/lib/stock/consultas";
import { leerFiltrosStock } from "../filtros";
import { SelectorEtiquetas } from "./selector";

export const metadata = { title: "Etiquetas" };

export default async function Etiquetas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requiereUsuario();
  const f = leerFiltrosStock(await searchParams);
  const [{ filas }, cfg] = await Promise.all([listarStock({ ...f, pagina: undefined }, undefined, true), leerConfig(["etiquetas.formato", "etiquetas.con_precio"])]);
  return (
    <>
      <Encabezado titulo="Etiquetas" bajada="Elegí las piezas y el formato. Se genera un PDF listo para la impresora de etiquetas o una hoja A4." />
      <Tarjeta className="p-4 sm:p-6">
        <SelectorEtiquetas
          piezas={filas.slice(0, 500).map((x) => ({ id: x.p.id, codigo: x.p.codigo, nombre: x.p.nombre, creado: x.p.creadoEn.getTime() }))}
          formato={cfg["etiquetas.formato"]}
          conPrecio={cfg["etiquetas.con_precio"]}
          q={f.q ?? ""}
        />
      </Tarjeta>
    </>
  );
}

import { eq, sql } from "drizzle-orm";
import { Tarjeta } from "@/components/ui";
import { clientes, db, productos, proveedores } from "@/db";
import { leerConfig } from "@/lib/config";
import { listarCategorias, listarListas, listarUbicaciones } from "@/lib/stock/catalogos";
import { FilaCatalogo, FormOpciones, QuitarDemo } from "./formularios";

export const metadata = { title: "Configuración de stock" };

export default async function ConfigStock() {
  const [cats, ubis, listas, cfg, [{ demo }]] = await Promise.all([
    listarCategorias(),
    listarUbicaciones(),
    listarListas(),
    leerConfig(["stock.permitir_negativo", "stock.meses_sin_movimiento", "etiquetas.formato", "etiquetas.con_precio"]),
    db.select({ demo: sql<number>`count(*)` }).from(productos).where(eq(productos.esDemo, true)),
  ]);
  const [[{ cli }], [{ prov }]] = await Promise.all([
    db.select({ cli: sql<number>`count(*)` }).from(clientes).where(eq(clientes.esDemo, true)),
    db.select({ prov: sql<number>`count(*)` }).from(proveedores).where(eq(proveedores.esDemo, true)),
  ]);
  const bloque = (titulo: string, nota: string, hijos: React.ReactNode) => (
    <Tarjeta className="p-5 sm:p-6">
      <h2 className="font-medium">{titulo}</h2>
      <p className="mt-1 mb-4 text-sm text-gris">{nota}</p>
      <div className="flex flex-col gap-4">{hijos}</div>
    </Tarjeta>
  );
  return (
    <div className="flex flex-col gap-6">
      {bloque(
        "Datos de ejemplo",
        `El sistema trae datos de EJEMPLO para que veas cómo funciona (${demo} piezas, ${cli} clientes y ${prov} proveedores). Antes de cargar los reales, quitalos desde acá: es lo único que se borra de verdad, porque no son datos del negocio.`,
        <QuitarDemo cantidad={demo + cli + prov} />,
      )}
      {bloque("Opciones", "Stock negativo, avisos y etiquetas.", <FormOpciones v={{ negativo: cfg["stock.permitir_negativo"], meses: cfg["stock.meses_sin_movimiento"], formato: cfg["etiquetas.formato"], conPrecio: cfg["etiquetas.con_precio"] }} />)}
      <div className="grid gap-6 xl:grid-cols-2">
        {bloque("Categorías", "El prefijo arma el código automático (ANI-0001).", <>{cats.map((c) => <FilaCatalogo key={c.id} que="categoria" item={c} />)}<div className="border-t border-linea pt-4"><FilaCatalogo que="categoria" /></div></>)}
        {bloque("Ubicaciones", "Dónde está físicamente cada pieza.", <>{ubis.map((c) => <FilaCatalogo key={c.id} que="ubicacion" item={c} />)}<div className="border-t border-linea pt-4"><FilaCatalogo que="ubicacion" /></div></>)}
      </div>
      {bloque("Listas de precios", "Recargo o descuento sobre el precio de cada pieza (por ejemplo −10 contado, +15 tarjeta). Arrancan en 0 %: definilas vos.", <>{listas.map((c) => <FilaCatalogo key={c.id} que="lista" item={c} />)}<div className="border-t border-linea pt-4"><FilaCatalogo que="lista" /></div></>)}
    </div>
  );
}

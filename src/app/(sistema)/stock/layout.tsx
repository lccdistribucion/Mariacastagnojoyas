import { Pestanas } from "@/components/pestanas";
import { requiereUsuario } from "@/lib/auth/sesion";

export default async function LayoutStock({ children }: { children: React.ReactNode }) {
  const u = await requiereUsuario();
  const items = [
    { href: "/stock", texto: "Piezas", exacta: true },
    { href: "/stock/salidas", texto: "Fuera del local" },
    { href: "/stock/inventario", texto: "Inventario físico" },
    ...(u.permisos.has("modificar_precios") ? [{ href: "/stock/precios", texto: "Actualizar precios" }] : []),
    ...(u.permisos.has("cargar_productos") ? [{ href: "/stock/importar", texto: "Importar" }] : []),
    { href: "/stock/etiquetas", texto: "Etiquetas" },
    ...(u.permisos.has("ver_costos") ? [{ href: "/stock/metal", texto: "Metal propio" }] : []),
  ];
  return (
    <>
      <Pestanas items={items} etiqueta="Secciones de stock" />
      {children}
    </>
  );
}

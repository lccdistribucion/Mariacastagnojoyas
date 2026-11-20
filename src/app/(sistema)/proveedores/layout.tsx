import { Pestanas } from "@/components/pestanas";
import { requierePermiso } from "@/lib/auth/sesion";

export default async function LayoutProveedores({ children }: { children: React.ReactNode }) {
  await requierePermiso("ver_proveedores");
  return (
    <>
      <Pestanas
        etiqueta="Secciones de proveedores"
        items={[
          { href: "/proveedores", texto: "Proveedores", exacta: true },
          { href: "/proveedores/compras", texto: "Compras" },
          { href: "/proveedores/consignaciones", texto: "Consignaciones" },
          { href: "/proveedores/reposicion", texto: "Reposición" },
        ]}
      />
      {children}
    </>
  );
}

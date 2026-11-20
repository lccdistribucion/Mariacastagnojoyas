import { Pestanas } from "@/components/pestanas";
import { requierePermiso } from "@/lib/auth/sesion";

export default async function LayoutTesoreria({ children }: { children: React.ReactNode }) {
  await requierePermiso("ver_tesoreria");
  return (
    <>
      <Pestanas
        etiqueta="Secciones de tesorería"
        items={[
          { href: "/tesoreria", texto: "Resumen", exacta: true },
          { href: "/tesoreria/movimientos", texto: "Movimientos" },
          { href: "/tesoreria/tarjetas", texto: "Tarjetas" },
          { href: "/tesoreria/cheques", texto: "Cheques" },
          { href: "/tesoreria/flujo", texto: "Flujo de fondos" },
          { href: "/tesoreria/conciliacion", texto: "Conciliación" },
          { href: "/tesoreria/arqueos", texto: "Arqueos" },
          { href: "/tesoreria/cajas", texto: "Cajas y categorías" },
        ]}
      />
      {children}
    </>
  );
}

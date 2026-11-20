import { Pestanas } from "@/components/pestanas";
import { requiereUsuario } from "@/lib/auth/sesion";

export default async function LayoutVentas({ children }: { children: React.ReactNode }) {
  await requiereUsuario();
  return (
    <>
      <Pestanas
        etiqueta="Secciones de ventas"
        items={[
          { href: "/ventas", texto: "Ventas", exacta: true },
          { href: "/ventas/presupuestos", texto: "Presupuestos" },
          { href: "/ventas/reservas", texto: "Reservas" },
          { href: "/ventas/vales", texto: "Gift cards y vales" },
          { href: "/ventas/comisiones", texto: "Comisiones" },
        ]}
      />
      {children}
    </>
  );
}

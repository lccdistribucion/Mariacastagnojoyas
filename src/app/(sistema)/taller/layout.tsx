import { Pestanas } from "@/components/pestanas";
import { requiereUsuario } from "@/lib/auth/sesion";

export default async function LayoutTaller({ children }: { children: React.ReactNode }) {
  await requiereUsuario();
  return (
    <>
      <Pestanas etiqueta="Secciones del taller" items={[{ href: "/taller", texto: "Reparaciones", exacta: true }, { href: "/taller/pedidos", texto: "Pedidos a medida" }]} />
      {children}
    </>
  );
}

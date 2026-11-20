import { Pestanas } from "@/components/pestanas";
import { requiereUsuario } from "@/lib/auth/sesion";

export default async function LayoutClientes({ children }: { children: React.ReactNode }) {
  await requiereUsuario();
  return (
    <>
      <Pestanas etiqueta="Secciones de clientes" items={[{ href: "/clientes", texto: "Clientes", exacta: true }, { href: "/clientes/recordatorios", texto: "Recordatorios" }]} />
      {children}
    </>
  );
}

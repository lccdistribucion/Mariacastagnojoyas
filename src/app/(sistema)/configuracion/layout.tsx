import { Encabezado } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { Pestanas } from "./pestanas";

export default async function LayoutConfiguracion({ children }: { children: React.ReactNode }) {
  await requierePermiso("configurar_sistema");
  return (
    <>
      <Encabezado titulo="Configuración" bajada="Cada cambio queda registrado en Auditoría con el valor anterior." />
      <Pestanas />
      {children}
    </>
  );
}

import { Pestanas } from "@/components/pestanas";
import { Aviso } from "@/components/ui";
import { requierePermiso } from "@/lib/auth/sesion";
import { leerUna } from "@/lib/config";

export default async function LayoutFacturacion({ children }: { children: React.ReactNode }) {
  const u = await requierePermiso("ver_ventas_de_todos");
  const ambiente = await leerUna("arca.ambiente");
  return (
    <>
      <Pestanas
        etiqueta="Secciones de facturación"
        items={[
          { href: "/facturacion", texto: "Comprobantes", exacta: true },
          { href: "/facturacion/pendientes", texto: "Pendientes y rechazados" },
          ...(u.permisos.has("ver_sin_facturar") ? [{ href: "/facturacion/sin-facturar", texto: "Sin facturar" }] : []),
          { href: "/facturacion/nota-debito", texto: "Nota de débito" },
          { href: "/facturacion/libros", texto: "Libros IVA" },
          ...(u.permisos.has("configurar_sistema") ? [{ href: "/facturacion/configuracion", texto: "Configuración ARCA" }] : []),
        ]}
      />
      {ambiente !== "produccion" && (
        <div className="mb-5">
          <Aviso tono="alerta">
            {ambiente === "simulado" ? "Modo SIMULADO: los comprobantes se numeran y se ven como reales, pero no se envían a ARCA ni tienen validez fiscal. " : "Modo HOMOLOGACIÓN (prueba de ARCA): los comprobantes no tienen validez fiscal. "}
            Cuando esté el certificado, se pasa a producción en Configuración ARCA.
          </Aviso>
        </div>
      )}
      {children}
    </>
  );
}

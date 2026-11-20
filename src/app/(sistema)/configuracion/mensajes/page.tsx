import { Tarjeta } from "@/components/ui";
import { leerConfig } from "@/lib/config";
import { FormMensajes } from "./formulario";

export const metadata = { title: "Mensajes a clientes" };

export default async function Mensajes() {
  const c = await leerConfig(["mensajes.cumpleanos", "mensajes.aniversario", "mensajes.saldo", "mensajes.reparacion_lista", "mensajes.pedido_listo", "mensajes.comprobante"]);
  return (
    <Tarjeta className="p-5 sm:p-7">
      <h2 className="font-medium">Mensajes de WhatsApp</h2>
      <p className="mt-1 mb-5 text-sm text-gris">Se usan en Clientes → Recordatorios, en el taller y en las ventas. WhatsApp se abre con el texto escrito y la persona lo revisa antes de enviar: nada sale solo.</p>
      <FormMensajes v={{ cumpleanos: c["mensajes.cumpleanos"], aniversario: c["mensajes.aniversario"], saldo: c["mensajes.saldo"], reparacion: c["mensajes.reparacion_lista"], pedido: c["mensajes.pedido_listo"], comprobante: c["mensajes.comprobante"] }} />
    </Tarjeta>
  );
}

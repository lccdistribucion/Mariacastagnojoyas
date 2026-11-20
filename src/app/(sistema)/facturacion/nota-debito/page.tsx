import { Encabezado, Tarjeta } from "@/components/ui";
import { FormNotaDebito } from "./formulario";

export const metadata = { title: "Nota de débito" };

export default function NotaDebito() {
  return (
    <>
      <Encabezado titulo="Nota de débito" bajada="Para cobrarle a un cliente algo que no estaba en la factura (por ejemplo, intereses por pago fuera de término o los gastos de un cheque rechazado). Al autorizarse, suma a su cuenta corriente." />
      <Tarjeta className="max-w-2xl p-5"><FormNotaDebito /></Tarjeta>
    </>
  );
}

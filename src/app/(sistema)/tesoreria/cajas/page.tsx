import { and, eq } from "drizzle-orm";
import { db, movimientosCaja } from "@/db";
import { Aviso, Tarjeta } from "@/components/ui";
import { formatoMoneda, listarCajas, listarCategorias, TIPOS_CAJA } from "@/lib/tesoreria/cajas";
import { FilaCaja, FilaCategoria, FormSaldoInicial } from "./formularios";

export const metadata = { title: "Cajas y categorías" };

export default async function Cajas({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const [cajas, cats, iniciales] = await Promise.all([listarCajas(false), listarCategorias(), db.select({ cajaId: movimientosCaja.cajaId }).from(movimientosCaja).where(and(eq(movimientosCaja.tipo, "saldo_inicial"), eq(movimientosCaja.anulado, false)))]);
  const bancos = cajas.filter((c) => c.tipo === "banco").map((c) => ({ id: c.id, nombre: c.nombre }));
  const sinInicial = cajas.filter((c) => c.activa && !iniciales.some((i) => i.cajaId === c.id) && !["tarjetas", "cheques"].includes(c.tipo));
  return (
    <div className="flex flex-col gap-6">
      {aviso === "inicial" && <Aviso tono="ok">Saldo inicial cargado.</Aviso>}
      {sinInicial.length > 0 && (
        <Tarjeta className="p-5 sm:p-6">
          <h2 className="font-medium">Saldos iniciales</h2>
          <p className="mt-1 mb-4 text-sm text-gris">Para arrancar: cuánto hay hoy en cada caja y cuenta (contá el efectivo y mirá el saldo del banco). Se carga una sola vez. Antes, quitá los datos de ejemplo (Configuración → Stock): sus señas de prueba también suman en las cajas.</p>
          <div className="grid gap-3 md:grid-cols-2">{sinInicial.map((c) => <FormSaldoInicial key={c.id} caja={{ id: c.id, nombre: c.nombre, moneda: c.moneda }} />)}</div>
        </Tarjeta>
      )}
      <Tarjeta className="p-5 sm:p-6">
        <h2 className="font-medium">Cajas y cuentas</h2>
        <p className="mt-1 mb-4 text-sm text-gris">Cada caja tiene una moneda. Las de efectivo con «apertura y cierre» se cuentan todos los días. En las de tarjetas, los días y porcentajes son estimados para el flujo de fondos; lo real se carga al acreditar.</p>
        <div className="flex flex-col gap-4">
          {cajas.map((c) => (
            <div key={c.id} className="border-b border-linea pb-4 last:border-0">
              <p className="mb-2 text-xs text-gris">Saldo: {formatoMoneda(c.saldo, c.moneda)}</p>
              <FilaCaja tipos={TIPOS_CAJA} bancos={bancos} c={{ id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, arqueo: c.arqueo, dias: c.diasAcreditacion, comision: c.comisionPct, retencion: c.retencionPct, bancoId: c.bancoId, activa: c.activa, orden: c.orden }} />
            </div>
          ))}
          <div className="border-t border-linea pt-4"><p className="mb-2 text-sm font-medium">Agregar caja o cuenta</p><FilaCaja tipos={TIPOS_CAJA} bancos={bancos} /></div>
        </div>
      </Tarjeta>
      <div className="grid gap-6 xl:grid-cols-2">
        {(["gasto", "ingreso"] as const).map((t) => (
          <Tarjeta key={t} className="p-5 sm:p-6">
            <h2 className="mb-4 font-medium">Categorías de {t === "gasto" ? "gastos" : "ingresos varios"}</h2>
            <div className="flex flex-col gap-2">
              {cats.filter((c) => c.tipo === t).map((c) => <FilaCategoria key={c.id} tipo={t} c={{ id: c.id, nombre: c.nombre, activa: c.activa }} />)}
              <div className="border-t border-linea pt-3"><FilaCategoria tipo={t} /></div>
            </div>
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}

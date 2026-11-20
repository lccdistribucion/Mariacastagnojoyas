/** Números de tesorería para el Inicio del administrador. */
import { listarAcreditaciones } from "./acreditaciones";
import { estadoDelDia } from "./arqueos";
import { listarCajas } from "./cajas";

export async function resumenTesoreria() {
  const [cajas, pend, dia] = await Promise.all([listarCajas(), listarAcreditaciones("pendiente"), estadoDelDia()]);
  const ahora = Date.now();
  const estados = dia.map((d) => (d.arqueo?.cierreEn ? "cerrada" : d.arqueo?.aperturaEn ? "abierta" : "sin abrir"));
  return {
    disponible: cajas.filter((c) => ["efectivo", "banco", "billetera"].includes(c.tipo)).reduce((s, c) => s + (c.enPesos ?? 0), 0),
    tarjetas: cajas.filter((c) => c.tipo === "tarjetas").reduce((s, c) => s + (c.enPesos ?? 0), 0),
    tarjetasAtrasadas: pend.filter((p) => p.a.fechaEsperada.getTime() < ahora - 86400_000).length,
    cheques: cajas.filter((c) => c.tipo === "cheques").reduce((s, c) => s + (c.enPesos ?? 0), 0),
    caja: !estados.length ? "—" : estados.includes("sin abrir") ? "sin abrir" : estados.includes("abierta") ? "abierta" : "cerrada",
  };
}

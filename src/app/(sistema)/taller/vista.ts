/** Colores de los estados (se usa en listados y fichas). */
export const TONO_REP: Record<string, "neutro" | "ok" | "alerta" | "champagne" | "error"> = { recibida: "neutro", en_taller: "champagne", lista: "ok", avisada: "ok", entregada: "neutro", abandonada: "error" };
export const TONO_PED: Record<string, "neutro" | "ok" | "alerta" | "champagne" | "error"> = { presupuestado: "neutro", aprobado: "champagne", en_taller: "champagne", listo: "ok", entregado: "neutro", cancelado: "error" };

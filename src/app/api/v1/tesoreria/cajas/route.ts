import { NextResponse } from "next/server";
import { conSesion } from "@/lib/api";
import { listarCajas } from "@/lib/tesoreria/cajas";

/** GET /api/v1/tesoreria/cajas — cajas y cuentas con su saldo (en su moneda y en pesos). Requiere «Ver tesorería». */
export const GET = conSesion("ver_tesoreria", async () => NextResponse.json({ cajas: await listarCajas() }));

/** POST /api/v1/taller/{reparacion|pedido}/:id/fotos — fotos del estado de la pieza al ingreso o referencias del pedido (campo «foto»). */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, pedidos, reparaciones } from "@/db";
import { conSesion } from "@/lib/api";
import { actorDe } from "@/lib/auth/sesion";
import { ErrorValidacion } from "@/lib/config";
import { agregarAdjunto } from "@/lib/taller/adjuntos";

export const POST = conSesion<{ params: Promise<{ entidad: string; id: string }> }>(null, async (u, req, ctx) => {
  const { entidad, id: idTxt } = await ctx.params;
  const id = Number(idTxt);
  if (entidad !== "reparacion" && entidad !== "pedido") return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const [existe] = entidad === "reparacion" ? await db.select({ id: reparaciones.id }).from(reparaciones).where(eq(reparaciones.id, id)) : await db.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.id, id));
  if (!existe) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const form = await req.formData();
  const archivos = form.getAll("foto").filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
  const actor = await actorDe(u);
  const subidas: string[] = [];
  try {
    for (const a of archivos.slice(0, 8)) subidas.push(await agregarAdjunto(entidad, id, Buffer.from(await a.arrayBuffer()), actor));
  } catch (e) {
    if (e instanceof ErrorValidacion) return NextResponse.json({ error: e.message, subidas }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ subidas });
});

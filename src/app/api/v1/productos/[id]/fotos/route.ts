/** POST /api/v1/productos/:id/fotos — sube una o varias fotos (campo «foto»). Requiere «cargar_productos». */
import { NextResponse } from "next/server";
import { actorDe } from "@/lib/auth/sesion";
import { conSesion } from "@/lib/api";
import { ErrorValidacion } from "@/lib/config";
import { agregarFoto } from "@/lib/stock/fotos";

export const POST = conSesion<{ params: Promise<{ id: string }> }>("cargar_productos", async (u, req, ctx) => {
  const id = Number((await ctx.params).id);
  const form = await req.formData();
  const archivos = form.getAll("foto").filter((x): x is File => x instanceof File);
  if (!archivos.length) return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
  const actor = await actorDe(u);
  const subidas = [];
  try {
    for (const a of archivos) subidas.push(await agregarFoto(id, Buffer.from(await a.arrayBuffer()), actor));
  } catch (e) {
    if (e instanceof ErrorValidacion) return NextResponse.json({ error: e.message, subidas }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ subidas });
});

"use server";
import { revalidatePath } from "next/cache";
import { marcarLeidas } from "@/lib/alertas";
import { requierePermiso } from "@/lib/auth/sesion";

export async function marcarTodas() {
  const u = await requierePermiso("modificar_cotizaciones");
  await marcarLeidas(u.id);
  revalidatePath("/", "layout");
}

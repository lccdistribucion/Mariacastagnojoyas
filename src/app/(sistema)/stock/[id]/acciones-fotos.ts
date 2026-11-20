"use server";
import { revalidatePath } from "next/cache";
import { actorDe, requierePermiso } from "@/lib/auth/sesion";
import { fotoPrincipal, ocultarFoto } from "@/lib/stock/fotos";

export async function accionFoto(f: FormData) {
  const u = await requierePermiso("cargar_productos");
  const id = Number(f.get("fotoId"));
  if (f.get("que") === "principal") await fotoPrincipal(id);
  else await ocultarFoto(id, await actorDe(u));
  revalidatePath(`/stock/${f.get("productoId")}`);
}

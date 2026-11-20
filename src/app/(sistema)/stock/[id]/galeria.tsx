"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { IconoAnillo } from "@/components/iconos";
import { accionFoto } from "./acciones-fotos";

type Foto = { id: number; archivo: string };

/** Achica la foto en el celular antes de subirla (más rápido con datos móviles). */
async function achicar(f: File): Promise<Blob> {
  if (!f.type.startsWith("image/") || f.type === "image/heic" || f.size < 1_500_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * escala);
    c.height = Math.round(bmp.height * escala);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? f), "image/jpeg", 0.88));
  } catch {
    return f;
  }
}

export function Galeria({ productoId, fotos, nombre, puedeEditar }: { productoId: number; fotos: Foto[]; nombre: string; puedeEditar: boolean }) {
  const router = useRouter();
  const [actual, setActual] = useState(0);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const foto = fotos[Math.min(actual, fotos.length - 1)];

  const subir = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setError(null);
    const form = new FormData();
    for (const [k, f] of [...lista].entries()) {
      setSubiendo(`Preparando ${k + 1} de ${lista.length}…`);
      form.append("foto", await achicar(f), f.name);
    }
    setSubiendo("Subiendo…");
    const r = await fetch(`/api/v1/productos/${productoId}/fotos`, { method: "POST", body: form });
    const j = await r.json().catch(() => ({}));
    setSubiendo(null);
    if (!r.ok) setError(j.error ?? "No se pudo subir la foto.");
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-linea bg-papel">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/stock-foto?a=${encodeURIComponent(foto.archivo)}`} alt={nombre} className="size-full object-contain" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-linea-fuerte">
            <IconoAnillo className="size-16" />
            <span className="text-sm text-gris">Sin fotos</span>
          </div>
        )}
      </div>
      {fotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {fotos.map((f, k) => (
            <button key={f.id} onClick={() => setActual(k)} className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${k === actual ? "border-tinta" : "border-transparent"}`} aria-label={`Ver foto ${k + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/stock-foto?a=${encodeURIComponent(f.archivo)}&mini=1`} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-linea-fuerte bg-superficie px-4 text-sm hover:border-tinta">
            {subiendo ?? "+ Agregar fotos"}
            <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={!!subiendo} onChange={(e) => subir(e.target.files)} />
          </label>
          {foto && (
            <>
              {actual > 0 && (
                <form action={accionFoto}>
                  <input type="hidden" name="fotoId" value={foto.id} /><input type="hidden" name="productoId" value={productoId} /><input type="hidden" name="que" value="principal" />
                  <button className="min-h-11 rounded-lg px-3 text-sm text-gris hover:text-tinta">Usar como principal</button>
                </form>
              )}
              <form action={accionFoto} onSubmit={(e) => !confirm("¿Quitar esta foto? (queda guardada, oculta)") && e.preventDefault()}>
                <input type="hidden" name="fotoId" value={foto.id} /><input type="hidden" name="productoId" value={productoId} /><input type="hidden" name="que" value="ocultar" />
                <button className="min-h-11 rounded-lg px-3 text-sm text-gris hover:text-error">Quitar</button>
              </form>
            </>
          )}
        </div>
      )}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}

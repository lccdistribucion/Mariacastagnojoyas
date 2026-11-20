"use client";
/** Fotos de reparaciones y pedidos: se sacan con la cámara del celular o se eligen de la galería. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clasesBoton } from "@/components/ui";

export async function subirFotos(entidad: "reparacion" | "pedido", id: number, archivos: File[]) {
  if (!archivos.length) return null;
  const form = new FormData();
  for (const a of archivos) form.append("foto", a);
  const r = await fetch(`/api/v1/taller/${entidad}/${id}/fotos`, { method: "POST", body: form });
  if (!r.ok) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudieron subir las fotos.";
  return null;
}

export function GaleriaTaller({ entidad, id, fotos }: { entidad: "reparacion" | "pedido"; id: number; fotos: string[] }) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grande, setGrande] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {fotos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f}>
              <button type="button" onClick={() => setGrande(f)} className="block w-full" aria-label="Ver foto grande">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/stock-foto?a=${encodeURIComponent(f)}&mini=1`} alt="" className="aspect-square w-full rounded-lg bg-papel object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gris">Sin fotos.</p>
      )}
      <label className={clasesBoton("secundario", "cursor-pointer self-start")}>
        {subiendo ? "Subiendo…" : "+ Agregar fotos"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={subiendo}
          onChange={async (e) => {
            const archivos = [...(e.target.files ?? [])];
            e.target.value = "";
            setSubiendo(true);
            setError(await subirFotos(entidad, id, archivos));
            setSubiendo(false);
            router.refresh();
          }}
        />
      </label>
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      {grande && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/80 p-4" role="dialog" aria-modal onClick={() => setGrande(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/stock-foto?a=${encodeURIComponent(grande)}`} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

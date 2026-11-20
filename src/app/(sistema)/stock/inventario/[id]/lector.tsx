"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { accionLeer } from "../acciones";

type Lectura = { codigo: string; texto: string; tono: "ok" | "alerta" | "error"; hora: string };

declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
  }
}

/**
 * Lector para la toma de inventario. Funciona con un lector de códigos USB/Bluetooth (escribe y da Enter),
 * tipeando a mano, o con la cámara del celular si el navegador lo permite (Chrome en Android).
 */
export function Lector({ inventarioId, leidas }: { inventarioId: number; leidas: number }) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [ultimas, setUltimas] = useState<Lectura[]>([]);
  const [, iniciar] = useTransition();
  const [camara, setCamara] = useState(false);
  const [hayCamara, setHayCamara] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const ultimoCodigo = useRef<{ c: string; t: number }>({ c: "", t: 0 });

  useEffect(() => setHayCamara(typeof window !== "undefined" && !!window.BarcodeDetector && !!navigator.mediaDevices), []);

  const leer = (codigo: string) => {
    const c = codigo.trim();
    if (!c) return;
    // La cámara puede leer el mismo código varias veces seguidas: se ignora si es el mismo en menos de 3 s.
    if (ultimoCodigo.current.c === c && Date.now() - ultimoCodigo.current.t < 3000) return;
    ultimoCodigo.current = { c, t: Date.now() };
    iniciar(async () => {
      const r = await accionLeer(inventarioId, c);
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const l: Lectura = !r.ok
        ? { codigo: c, texto: r.error, tono: "error", hora }
        : !r.producto
          ? { codigo: c, texto: "Este código no existe en el sistema", tono: "error", hora }
          : r.repetida
            ? { codigo: r.producto.codigo, texto: `${r.producto.nombre} — ya la habías leído`, tono: "alerta", hora }
            : { codigo: r.producto.codigo, texto: `${r.producto.nombre}${r.producto.tipo !== "unica" ? ` · van ${r.contadas}` : ""}`, tono: "ok", hora };
      setUltimas((u) => [l, ...u].slice(0, 30));
      navigator.vibrate?.(l.tono === "ok" ? 40 : [80, 60, 80]);
      router.refresh();
    });
  };

  useEffect(() => {
    if (!camara || !window.BarcodeDetector) return;
    let activo = true;
    let flujo: MediaStream | null = null;
    const detector = new window.BarcodeDetector({ formats: ["code_128", "qr_code", "ean_13", "code_39"] });
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        while (activo) {
          const r = await detector.detect(video.current).catch(() => []);
          if (r[0]?.rawValue) leer(r[0].rawValue);
          await new Promise((ok) => setTimeout(ok, 350));
        }
      } catch {
        setCamara(false);
      }
    })();
    return () => {
      activo = false;
      flujo?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camara]);

  const color = { ok: "border-ok/30 bg-ok-suave text-ok", alerta: "border-alerta/30 bg-alerta-suave text-alerta", error: "border-error/30 bg-error-suave text-error" };

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          leer(valor);
          setValor("");
          input.current?.focus();
        }}
        className="flex gap-2"
      >
        <input
          ref={input}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="campo h-14 text-lg tracking-wider uppercase placeholder:tracking-normal placeholder:normal-case"
          placeholder="Escaneá o escribí el código"
          aria-label="Código leído"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="go"
        />
        <button className="min-h-14 rounded-lg bg-tinta px-5 font-medium text-white">Leer</button>
      </form>
      {hayCamara && (
        <button type="button" onClick={() => setCamara((c) => !c)} className="min-h-11 rounded-lg border border-linea-fuerte px-4 text-sm">
          {camara ? "Apagar la cámara" : "Usar la cámara del celular"}
        </button>
      )}
      {camara && <video ref={video} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />}
      <p className="text-sm text-gris">{leidas} lecturas en esta toma.</p>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {ultimas.map((l, k) => (
          <li key={k} className={`rounded-lg border px-4 py-3 text-sm ${color[l.tono]} ${k === 0 ? "" : "opacity-70"}`}>
            <span className="font-semibold tracking-wider">{l.codigo}</span> · {l.texto} <span className="float-right text-xs opacity-70">{l.hora}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

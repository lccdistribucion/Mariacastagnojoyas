"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Cierre de sesión por inactividad, del lado del navegador:
 * - si la persona está usando la pantalla, avisa al servidor cada 2 minutos (así no se le cierra mientras carga algo largo);
 * - un minuto antes del cierre muestra un aviso con «Seguir conectada»;
 * - al cumplirse el tiempo, cierra la sesión y vuelve al ingreso.
 * El servidor controla lo mismo por su lado: aunque este código no corriera, la sesión vence igual.
 */
export function ControlInactividad({ minutos }: { minutos: number }) {
  const ultimaActividad = useRef(Date.now());
  const ultimoLatido = useRef(Date.now());
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    const marcar = () => {
      ultimaActividad.current = Date.now();
    };
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));

    const reloj = setInterval(() => {
      const ahora = Date.now();
      const quieto = ahora - ultimaActividad.current;
      const limite = minutos * 60_000;
      if (quieto >= limite) {
        clearInterval(reloj);
        const f = document.createElement("form");
        f.method = "post";
        f.action = "/salir?motivo=inactividad";
        document.body.appendChild(f);
        f.submit();
        return;
      }
      setRestante(limite - quieto <= 60_000 ? Math.ceil((limite - quieto) / 1000) : null);
      // Hubo actividad desde el último aviso al servidor → avisar (como mucho cada 2 minutos)
      if (ultimaActividad.current > ultimoLatido.current && ahora - ultimoLatido.current > 120_000) {
        ultimoLatido.current = ahora;
        fetch("/api/v1/sesion/latido", { method: "POST" })
          .then((r) => {
            if (r.status === 401) window.location.href = "/ingresar?motivo=inactividad";
          })
          .catch(() => {});
      }
    }, 1000);
    return () => {
      clearInterval(reloj);
      eventos.forEach((e) => window.removeEventListener(e, marcar));
    };
  }, [minutos]);

  if (restante == null) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-4 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm sm:p-0" role="alertdialog" aria-live="assertive">
      <div className="rounded-xl border border-linea bg-superficie p-4 shadow-suave">
        <p className="text-sm">Por seguridad, la sesión se cierra en <strong>{restante} s</strong> por inactividad.</p>
        <button
          onClick={() => {
            ultimaActividad.current = Date.now();
            ultimoLatido.current = 0;
            setRestante(null);
          }}
          className="mt-3 min-h-11 w-full rounded-lg bg-tinta text-sm font-medium text-white"
        >
          Seguir conectada
        </button>
      </div>
    </div>
  );
}

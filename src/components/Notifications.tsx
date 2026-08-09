"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Avisos in-app: "¡te toca dibujar!", "empezó una ronda nueva", etc.
//
// La idea original era usar `portal.inbox()`, pero no sirve aquí: la app corre
// en modo anónimo y el inbox de un usuario anónimo se queda permanentemente
// vacío (verificado contra el backend: `anon: true`, el inbox nunca pasa de
// `reconnecting` y entrega 0 items). El inbox necesita usuarios autenticados
// con token, que este juego no tiene. Los avisos se derivan entonces del
// estado que ya viaja por el canal `game:<sala>`.

const SHOW_MS = 4000;

export type Toast = { id: number; text: string; tone: "turn" | "info"; expiresAt: number };

export default function Notifications({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-[pp-drop_300ms_ease-out] rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur ${
            t.tone === "turn"
              ? "border-accent/60 bg-accent text-white"
              : "border-edge bg-panel text-fg/90"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/**
 * Cola de avisos con auto-descarte. Se expone como hook para que quien tenga
 * el estado del juego decida *cuándo* avisar, y este archivo solo se ocupe de
 * mostrarlo y limpiarlo.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, text, tone, expiresAt: Date.now() + SHOW_MS }]);
  }, []);

  // Cada aviso lleva su hora de caducidad y un único barrido los retira.
  //
  // Antes cada aviso tenía su propio setTimeout, guardados en un array que un
  // efecto limpiaba al desmontar. Con `reactStrictMode` (activado en
  // next.config.mjs) React monta, desmonta y vuelve a montar a propósito en
  // desarrollo: ese desmontaje intermedio cancelaba los temporizadores ya
  // programados, y como las guardas anti-repetición sobreviven al remontaje,
  // el aviso no se volvía a emitir — quedaba fijo en pantalla para siempre,
  // mostrando el estado de una ronda vieja. Con marcas de tiempo no hay nada
  // que cancelar: si el barrido se reinicia, simplemente vuelve a calcular.
  useEffect(() => {
    if (toasts.length === 0) return;
    const iv = setInterval(() => {
      const now = Date.now();
      setToasts((prev) =>
        prev.some((t) => t.expiresAt <= now) ? prev.filter((t) => t.expiresAt > now) : prev,
      );
    }, 250);
    return () => clearInterval(iv);
  }, [toasts.length]);

  return { toasts, push };
}

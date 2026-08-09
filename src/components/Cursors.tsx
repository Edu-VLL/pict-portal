"use client";

import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { useChannel } from "@portalsdk/react";
import { CursorMsg, cursorChannel } from "@/lib/types";
import { colorForName } from "@/lib/players";

// El lápiz del dibujante, visible para todos en tiempo real.
//
// Va por su propio canal con `history: "none"`: son decenas de mensajes por
// segundo que no sirven de nada un segundo después, así que nadie necesita
// recibirlos al entrar. Se envían como mensajes normales, no `ephemeral: true`
// — el SDK descarta en silencio los ephemeral entrantes, así que ese flag no
// sirve para nada que otro cliente deba ver (verificado contra el backend).

const SEND_EVERY_MS = 55; // ~18 actualizaciones por segundo
const STALE_MS = 2500; // sin novedades, el cursor se desvanece

type Remote = { x: number; y: number; name: string; at: number };

export type CursorReporter = (p: { x: number; y: number } | null) => void;

export default function Cursors({
  roomCode,
  name,
  enabled,
  reportRef,
}: {
  roomCode: string;
  name: string;
  /** Solo quien dibuja reporta su cursor. */
  enabled: boolean;
  /** El lienzo deja aquí la función para reportar la posición del puntero. */
  reportRef: MutableRefObject<CursorReporter | null>;
}) {
  const [remotes, setRemotes] = useState<Map<string, Remote>>(() => new Map());
  const lastSentAt = useRef(0);
  const pending = useRef<{ x: number; y: number } | null>(null);

  const { send } = useChannel<CursorMsg>({
    channelId: cursorChannel(roomCode),
    history: "none",
    onMessage: (m) => {
      const id = m.sender?.id;
      if (!id) return;
      if (m.content.kind === "gone") {
        setRemotes((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        return;
      }
      const { x, y, name: who } = m.content;
      setRemotes((prev) => new Map(prev).set(id, { x, y, name: who, at: Date.now() }));
    },
  });

  // Coalesce: el puntero dispara muchísimos eventos, así que se guarda el
  // último y se envía a ritmo fijo en vez de uno por evento.
  const report = useCallback<CursorReporter>(
    (p) => {
      if (!p) {
        pending.current = null;
        void send({ content: { kind: "gone" } });
        return;
      }
      pending.current = p;
      const now = Date.now();
      if (now - lastSentAt.current < SEND_EVERY_MS) return;
      lastSentAt.current = now;
      void send({ content: { kind: "move", x: p.x, y: p.y, name } });
    },
    [send, name],
  );

  useEffect(() => {
    reportRef.current = enabled ? report : null;
    return () => {
      reportRef.current = null;
    };
  }, [reportRef, report, enabled]);

  // Al dejar de dibujar, retirar nuestro cursor de las demás pantallas.
  useEffect(() => {
    if (enabled) return;
    void send({ content: { kind: "gone" } });
  }, [enabled, send]);

  // Un cursor cuyo dueño se desconectó nunca manda "gone": se caduca solo.
  useEffect(() => {
    const iv = setInterval(() => {
      const cutoff = Date.now() - STALE_MS;
      setRemotes((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, r] of prev) {
          if (r.at < cutoff) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      {[...remotes.entries()].map(([id, r]) => (
        <div
          key={id}
          className="pointer-events-none absolute z-10 transition-[left,top] duration-75 ease-linear"
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow">
            <path
              d="M2 2 L2 14 L5.5 10.8 L7.8 15.5 L10 14.4 L7.8 9.9 L12.5 9.9 Z"
              fill={colorForName(r.name)}
              stroke="#0f1115"
              strokeWidth="1"
            />
          </svg>
          <span
            className="ml-3 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
            style={{ background: colorForName(r.name) }}
          >
            {r.name}
          </span>
        </div>
      ))}
    </>
  );
}

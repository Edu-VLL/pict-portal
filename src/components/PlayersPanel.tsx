"use client";

import { useEffect, useRef, useState } from "react";
import PlayerBadge from "./PlayerBadge";

export type PlayerRow = {
  id: string;
  name: string;
  isMe: boolean;
  isDrawer: boolean;
  isTyping: boolean;
};

type Phase = "entering" | "present" | "leaving";
type AnimatedRow = PlayerRow & { phase: Phase };

const EXIT_MS = 300;

export default function PlayersPanel({ players }: { players: PlayerRow[] }) {
  // Own a local, animated copy of the roster instead of rendering `players`
  // directly: a row that drops out of `players` still needs to stick around
  // in the DOM long enough to play its exit transition before it's removed.
  const [rows, setRows] = useState<AnimatedRow[]>(() =>
    players.map((p) => ({ ...p, phase: "present" as const })),
  );
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setRows((prev) => {
      const prevById = new Map(prev.map((r) => [r.id, r]));
      const nextIds = new Set(players.map((p) => p.id));

      const next: AnimatedRow[] = players.map((p) => {
        const existing = prevById.get(p.id);
        if (existing?.phase === "leaving") {
          // Rejoined mid-exit — cancel the pending removal and re-enter.
          const t = exitTimers.current.get(p.id);
          if (t) clearTimeout(t);
          exitTimers.current.delete(p.id);
          return { ...p, phase: "entering" };
        }
        if (existing) return { ...p, phase: existing.phase };
        return { ...p, phase: "entering" };
      });

      for (const r of prev) {
        if (nextIds.has(r.id) || r.phase === "leaving") {
          if (!nextIds.has(r.id)) next.push(r); // already leaving, keep as-is
          continue;
        }
        next.push({ ...r, phase: "leaving" });
        const timer = setTimeout(() => {
          setRows((curr) => curr.filter((x) => x.id !== r.id));
          exitTimers.current.delete(r.id);
        }, EXIT_MS);
        exitTimers.current.set(r.id, timer);
      }

      return next;
    });
  }, [players]);

  useEffect(() => {
    const timers = exitTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // Freshly-entered rows start collapsed; flip them to "present" a frame
  // later so the browser actually animates the transition in, instead of
  // painting the final state straight away.
  useEffect(() => {
    const enteringIds = rows.filter((r) => r.phase === "entering").map((r) => r.id);
    if (enteringIds.length === 0) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setRows((curr) =>
          curr.map((r) =>
            enteringIds.includes(r.id) && r.phase === "entering" ? { ...r, phase: "present" } : r,
          ),
        );
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [rows]);

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-edge bg-panel px-4 py-3 lg:h-full lg:w-56 lg:shrink-0">
      <span className="text-xs uppercase tracking-wide text-fg/40">
        Players · {players.length}
      </span>
      <ul className="flex flex-col">
        {rows.map((p) => {
          const open = p.phase === "present";
          return (
            <li
              key={p.id}
              className={`grid overflow-hidden transition-all duration-300 ease-out ${
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={`flex items-center gap-2 py-1.5 transition-transform duration-300 ease-out ${
                    open ? "translate-x-0" : "-translate-x-2"
                  }`}
                >
                  <PlayerBadge name={p.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm text-fg/80">
                      <span className="truncate">{p.name}</span>
                      {p.isMe && <span className="shrink-0 text-xs text-fg/40">(you)</span>}
                      {p.isDrawer && (
                        <span className="shrink-0" title="drawing">
                          ✏️
                        </span>
                      )}
                    </div>
                    <div className="h-4 text-xs text-accent">
                      {p.isTyping && (
                        <span className="inline-flex items-center gap-1">
                          <span className="flex gap-0.5">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-accent" />
                          </span>
                          typing…
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

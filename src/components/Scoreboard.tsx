"use client";

import { useEffect, useRef, useState } from "react";
import PlayerBadge from "./PlayerBadge";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Scoreboard({ scores }: { scores: [string, number][] }) {
  const prevRef = useRef<Map<string, number>>(new Map());
  const [bumped, setBumped] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    for (const [name, score] of scores) {
      if ((prev.get(name) ?? 0) < score) {
        setBumped(name);
        const t = setTimeout(() => setBumped(null), 700);
        prevRef.current = new Map(scores);
        return () => clearTimeout(t);
      }
    }
    prevRef.current = new Map(scores);
  }, [scores]);

  if (scores.length === 0) return null;

  return (
    <div className="rounded-xl border border-edge bg-panel px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-fg/40">Scoreboard</span>
      <ul className="mt-2 flex flex-col gap-1.5">
        {scores.map(([name, score], i) => {
          const isAi = name === "🤖 AI";
          const displayName = isAi ? "AI" : name;
          return (
            <li
              key={name}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-transform duration-300 ${
                bumped === name ? "scale-[1.03] bg-accent/10" : ""
              }`}
            >
              <span className="w-5 text-center text-sm">
                {MEDALS[i] ?? `${i + 1}.`}
              </span>
              {isAi ? (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fg/10 text-xs">
                  🤖
                </span>
              ) : (
                <PlayerBadge name={displayName} />
              )}
              <span className="flex-1 truncate text-sm text-fg/80">{displayName}</span>
              <span className="font-mono text-sm font-semibold text-fg/90">{score}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";
import PlayerBadge from "./PlayerBadge";

export default function Lobby({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onJoin(trimmed);
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-8">
        <h1 className="text-2xl font-semibold">
          Pict<span className="text-accent">-Portal</span>
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Realtime multiplayer Pictionary — with an AI that watches your strokes
          and races to guess. Open this in two tabs to see it live.
        </p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-edge bg-ink px-3 py-2 focus-within:border-accent">
            {trimmed && <PlayerBadge name={trimmed} />}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-transparent outline-none placeholder:text-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={!trimmed}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            Join room
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";

export default function Lobby({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n) onJoin(n);
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
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-md border border-edge bg-ink px-3 py-2 outline-none placeholder:text-white/30 focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 font-medium text-white"
          >
            Join room
          </button>
        </form>
      </div>
    </div>
  );
}

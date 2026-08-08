"use client";

import { FormEvent, useState } from "react";
import PlayerBadge from "./PlayerBadge";
import { generateRoomCode, normalizeRoomCode } from "@/lib/room";

export default function Lobby({
  onJoin,
}: {
  onJoin: (name: string, roomCode: string) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");

  const trimmed = name.trim();
  const trimmedCode = normalizeRoomCode(joinCode);
  const canSubmit = trimmed.length > 0 && (mode === "create" || trimmedCode.length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onJoin(trimmed, mode === "create" ? generateRoomCode() : trimmedCode);
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

        <div className="mt-6 flex gap-2 rounded-md border border-edge p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 rounded-sm py-1.5 text-sm transition ${
              mode === "create" ? "bg-accent text-white" : "text-white/60 hover:text-white/80"
            }`}
          >
            Create room
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 rounded-sm py-1.5 text-sm transition ${
              mode === "join" ? "bg-accent text-white" : "text-white/60 hover:text-white/80"
            }`}
          >
            Join with code
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
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

          {mode === "join" && (
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Room code"
              maxLength={8}
              className="rounded-md border border-edge bg-ink px-3 py-2 uppercase tracking-widest outline-none placeholder:text-white/30 placeholder:tracking-normal focus:border-accent"
            />
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            {mode === "create" ? "Create & join" : "Join room"}
          </button>
        </form>
      </div>
    </div>
  );
}
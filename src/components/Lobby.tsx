"use client";

import { FormEvent, useEffect, useState } from "react";
import PlayerBadge from "./PlayerBadge";
import ThemeToggle from "./ThemeToggle";
import { generateRoomCode, normalizeRoomCode } from "@/lib/room";
import { portal } from "@/lib/portal";
import {
  chatChannel,
  cursorChannel,
  drawChannel,
  gameChannel,
  reactionsChannel,
} from "@/lib/types";

export default function Lobby({
  onJoin,
}: {
  onJoin: (name: string, roomCode: string) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [joinCode, setJoinCode] = useState("");

  // Generated once per visit (not at submit time) so it can double as the
  // room to prewarm below — reusing the exact code we're about to create.
  const [createdCode] = useState(() => generateRoomCode());

  const trimmed = name.trim();
  const trimmedCode = normalizeRoomCode(joinCode);
  const canSubmit = trimmed.length > 0 && (mode === "create" || trimmedCode.length > 0);

  // Opens the room's 3 channels ahead of time, while the user is still
  // filling in the form. Connecting to Portal — minting an anonymous
  // identity plus a subscribe handshake per channel — reliably takes a
  // couple of seconds (verified against the live backend); starting it here
  // hides that wait behind normal typing time. `portal.channel(id)` is a
  // registry lookup that hands back this exact same handle to Game's own
  // useChannel on submit, already connecting (or connected) rather than
  // starting from zero. Gated to a full-length code in "join" mode so we're
  // not opening a fresh connection on every keystroke.
  const pendingRoomCode =
    mode === "create" ? createdCode : trimmedCode.length === 5 ? trimmedCode : undefined;
  useEffect(() => {
    if (!pendingRoomCode) return;
    const channels = [
      portal.channel(gameChannel(pendingRoomCode)),
      portal.channel(chatChannel(pendingRoomCode)),
      portal.channel(drawChannel(pendingRoomCode), { history: "none" }),
      portal.channel(cursorChannel(pendingRoomCode), { history: "none" }),
      portal.channel(reactionsChannel(pendingRoomCode), { history: "none" }),
    ];
    for (const c of channels) c.acquire();
    return () => {
      for (const c of channels) c.release();
    };
  }, [pendingRoomCode]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onJoin(trimmed, mode === "create" ? createdCode : trimmedCode);
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      {/* Decorative background — purely visual, never intercepts clicks */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            color: "var(--edge, #666)",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm rounded-2xl border border-edge bg-panel p-8 shadow-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Pict<span className="text-accent">-Portal</span>
          </h1>
          <ThemeToggle />
        </div>
        <p className="mt-2 text-sm text-fg/50">
          Pictionary multijugador en tiempo real, con una IA que mira tus
          trazos y compite por adivinar. Ábrelo en dos pestañas para verlo en vivo.
        </p>

        <div className="mt-6 flex gap-2 rounded-md border border-edge p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 rounded-sm py-1.5 text-sm transition ${
              mode === "create" ? "bg-accent text-white" : "text-fg/60 hover:text-fg/80"
            }`}
          >
            Crear sala
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 rounded-sm py-1.5 text-sm transition ${
              mode === "join" ? "bg-accent text-white" : "text-fg/60 hover:text-fg/80"
            }`}
          >
            Unirse con código
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-edge bg-ink px-3 py-2 focus-within:border-accent">
            {trimmed && <PlayerBadge name={trimmed} />}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-transparent outline-none placeholder:text-fg/30"
            />
          </div>

          {mode === "join" && (
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Código de sala"
              maxLength={8}
              className="rounded-md border border-edge bg-ink px-3 py-2 uppercase tracking-widest outline-none placeholder:text-fg/30 placeholder:tracking-normal focus:border-accent"
            />
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            {mode === "create" ? "Crear y entrar" : "Entrar a la sala"}
          </button>
        </form>
      </div>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChannel } from "@portalsdk/react";
import Canvas from "./Canvas";
import Chat, { FeedItem } from "./Chat";
import {
  ChatMsg,
  GameMsg,
  chatChannel,
  gameChannel,
} from "@/lib/types";
import { isCorrect, maskWord, randomWord } from "@/lib/words";

const ROUND_MS = 90_000;
const GUESS_EVERY_MS = 1_800;

type Round = {
  active: boolean;
  drawerId: string;
  drawerName: string;
  masked: string;
  endsAt: number;
  id: number;
};

const NO_ROUND: Round = {
  active: false,
  drawerId: "",
  drawerName: "",
  masked: "",
  endsAt: 0,
  id: 0,
};

export default function Game({ name }: { name: string }) {
  // ---- Channels -------------------------------------------------------------
  const game = useChannel<GameMsg>({
    channelId: gameChannel(),
    metadata: { name },
  });

  const wordRef = useRef<string | null>(null); // known only to the drawer
  const endedRef = useRef(false); // guards against double round-end
  const isDrawerRef = useRef(false);
  const nameRef = useRef(name);
  const sendChatRef = useRef<((m: ChatMsg) => void) | null>(null);
  const endRoundRef = useRef<((winner?: string, ai?: boolean) => void) | null>(null);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const chat = useChannel<ChatMsg>({
    channelId: chatChannel(),
    metadata: { name },
    onMessage: (m) => {
      // The drawer is the authority that validates human guesses.
      if (!isDrawerRef.current || endedRef.current) return;
      const c = m.content;
      if (c.kind !== "guess" || c.ai) return;
      if (c.name === nameRef.current) return;
      const word = wordRef.current;
      if (!word) return;
      if (isCorrect(c.text, word)) {
        sendChatRef.current?.({ kind: "correct", name: c.name, word });
        endRoundRef.current?.(c.name);
      }
    },
  });

  useEffect(() => {
    sendChatRef.current = (content: ChatMsg) => void chat.send({ content });
  }, [chat.send]);

  // ---- Derived round state --------------------------------------------------
  const round: Round = useMemo(() => {
    let start: (GameMsg & { kind: "round-start" }) | null = null;
    let lastStartIdx = -1;
    let lastEndIdx = -1;
    game.messages.forEach((m, i) => {
      if (m.content.kind === "round-start") {
        start = m.content;
        lastStartIdx = i;
      } else if (m.content.kind === "round-end") {
        lastEndIdx = i;
      }
    });
    if (!start || lastStartIdx < lastEndIdx) return NO_ROUND;
    const s = start as GameMsg & { kind: "round-start" };
    return {
      active: true,
      drawerId: s.drawerId,
      drawerName: s.drawerName,
      masked: s.masked,
      endsAt: s.endsAt,
      id: s.endsAt,
    };
  }, [game.messages]);

  const meId = game.me?.id;
  const isDrawer = round.active && !!meId && round.drawerId === meId;

  useEffect(() => {
    isDrawerRef.current = isDrawer;
  }, [isDrawer]);

  // ---- Round control --------------------------------------------------------
  const startRound = useCallback(() => {
    if (!meId) return;
    const word = randomWord();
    wordRef.current = word;
    endedRef.current = false;
    const endsAt = Date.now() + ROUND_MS;
    void game.send({
      content: {
        kind: "round-start",
        drawerId: meId,
        drawerName: name,
        masked: maskWord(word),
        endsAt,
      },
    });
  }, [game, meId, name]);

  const endRound = useCallback(
    (winner?: string, ai?: boolean) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const word = wordRef.current ?? "?";
      wordRef.current = null;
      void game.send({ content: { kind: "round-end", word, winner, ai } });
    },
    [game],
  );

  useEffect(() => {
    endRoundRef.current = endRound;
  }, [endRound]);

  // ---- AI guessing loop (drawer only) --------------------------------------
  useEffect(() => {
    if (!isDrawer || !round.active) return;
    endedRef.current = false;
    let stopped = false;

    const timer = setInterval(async () => {
      if (stopped || endedRef.current) return;
      const snap = snapshotRef.current?.();
      if (!snap) return;
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: snap }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          guess?: string;
          alternatives?: string[];
        };
        if (!data.ok || !data.guess || stopped || endedRef.current) return;
        sendChatRef.current?.({ kind: "guess", name: "AI", text: data.guess, ai: true });
        const word = wordRef.current;
        if (word) {
          const candidates = [data.guess, ...(data.alternatives ?? [])];
          if (candidates.some((c) => isCorrect(c, word))) {
            sendChatRef.current?.({ kind: "correct", name: "AI", word, ai: true });
            endRound("AI", true);
          }
        }
      } catch {
        /* transient — try again next tick */
      }
    }, GUESS_EVERY_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isDrawer, round.active, round.id, endRound]);

  // ---- Countdown + auto end -------------------------------------------------
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (isDrawer && round.active && now > round.endsAt) endRound();
  }, [isDrawer, round.active, round.endsAt, now, endRound]);

  const secondsLeft = round.active ? Math.max(0, Math.ceil((round.endsAt - now) / 1000)) : 0;

  // ---- Scoreboard from broadcast "correct" events --------------------------
  const scores = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of chat.messages) {
      if (m.content.kind === "correct") {
        const key = m.content.ai ? "🤖 AI" : m.content.name;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [chat.messages]);

  const feed: FeedItem[] = chat.messages.map((m) => ({ id: m.id, content: m.content }));

  const snapshotRef = useRef<(() => string | null) | null>(null);

  // ---- UI -------------------------------------------------------------------
  const wordLabel = isDrawer ? wordRef.current ?? "" : round.masked;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:h-screen lg:flex-row">
      {/* Left: canvas + status */}
      <div className="flex flex-1 flex-col gap-3">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            Pict<span className="text-accent">-Portal</span>
          </h1>
          <div className="text-xs text-white/50">
            {game.presence?.count ?? 1} online · you are{" "}
            <span className="text-white/80">{name}</span>
          </div>
        </header>

        <div className="flex items-center justify-between rounded-xl border border-edge bg-panel px-4 py-3">
          {round.active ? (
            <>
              <div className="text-sm">
                {isDrawer ? (
                  <>
                    You are drawing:{" "}
                    <span className="font-mono text-base font-semibold text-accent">
                      {wordLabel}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-white/60">{round.drawerName} is drawing</span>{" "}
                    <span className="ml-2 font-mono tracking-widest text-white/90">
                      {round.masked}
                    </span>
                  </>
                )}
              </div>
              <div
                className={`font-mono text-lg ${
                  secondsLeft <= 10 ? "text-red-400" : "text-white/70"
                }`}
              >
                {secondsLeft}s
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-white/60">
                No active round. Pick up the pen and let the AI try to guess.
              </div>
              <button
                onClick={startRound}
                disabled={!meId}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                I&apos;ll draw
              </button>
            </>
          )}
        </div>

        <Canvas key={round.id} isDrawer={isDrawer} snapshotRef={snapshotRef} />

        {scores.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-edge bg-panel px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-white/40">Scores</span>
            {scores.map(([n, s]) => (
              <span
                key={n}
                className="rounded-full bg-white/5 px-3 py-1 text-sm text-white/80"
              >
                {n} · {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: chat */}
      <div className="h-[420px] w-full lg:h-auto lg:w-96">
        <Chat
          items={feed}
          disabled={isDrawer || !round.active}
          placeholder={
            !round.active
              ? "Start a round to begin"
              : isDrawer
                ? "You're drawing — no peeking 🙂"
                : "Type your guess…"
          }
          onSend={(text) =>
            void chat.send({ content: { kind: "guess", name, text } })
          }
        />
      </div>
    </div>
  );
}

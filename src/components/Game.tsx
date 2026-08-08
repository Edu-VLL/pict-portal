"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChannel } from "@portalsdk/react";
import Canvas from "./Canvas";
import Chat, { FeedItem } from "./Chat";
import PlayerBadge from "./PlayerBadge";
import Scoreboard from "./Scoreboard";
import Status from "./Status";
import {
  ChatMsg,
  GameMsg,
  chatChannel,
  gameChannel,
} from "@/lib/types";
import { isCorrect, maskWord, randomWord } from "@/lib/words";

const ROUND_MS = 90_000;
const GUESS_EVERY_MS = 5_000;
const LOBBY_WAIT_MS = 30_000; // waiting room countdown before each round begins

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

export default function Game({ name, roomCode }: { name: string, roomCode: string}) {
  // ---- Channels -------------------------------------------------------------
  const game = useChannel<GameMsg>({
    channelId: gameChannel(roomCode),
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
    channelId: chatChannel(roomCode),
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
    // Take the MOST RECENT round-start. It's the active round unless a round-end
    // came after it or it already expired. Using the latest (by global seq
    // order) means every client converges on the same round, so simultaneous
    // "I'll draw" clicks collapse to one round — and a freshly clicked start is
    // always the one that wins (old expired starts in history are ignored).
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
    if (!start || lastEndIdx > lastStartIdx) return NO_ROUND;
    const s = start as GameMsg & { kind: "round-start" };

    if (Date.now() > s.endsAt) return NO_ROUND;
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

  // ---- Turn rotation: who draws next ---------------------------------------
  // Everyone currently in the room (from presence), plus ourselves, sorted so
  // every client agrees on the order.
  const roster = useMemo(() => {
    const ids = new Set<string>();
    const p = game.presence;
    if (p?.kind === "detailed") {
      for (const u of p.participants) ids.add(u.id);
    }
    if (meId) ids.add(meId);
    return [...ids].sort();
  }, [game.presence, meId]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    const p = game.presence;
    if (p?.kind === "detailed") {
      for (const u of p.participants) {
        const n = (u.metadata as { name?: string } | undefined)?.name;
        if (n) map.set(u.id, n);
      }
    }
    return map;
  }, [game.presence]);


  // ---- Round control --------------------------------------------------------
  const lastStartRef = useRef(0); // local debounce against double-clicks
  const startRound = useCallback(() => {
    // Don't start if there's already an active round, or if we just started
    // one (guards the double-click / double-fire cases locally). The first-wins
    // derivation above handles the cross-client race.
    if (!meId || round.active) return;
    const now = Date.now();
    if (now - lastStartRef.current < 2000) return;
    lastStartRef.current = now;
    const word = randomWord();
    wordRef.current = word;
    endedRef.current = false;
    const endsAt = now + ROUND_MS;
    void game.send({
      content: {
        kind: "round-start",
        drawerId: meId,
        drawerName: name,
        masked: maskWord(word),
        endsAt,
      },
    });
  }, [game, meId, name, round.active]);


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

  // ---- Waiting room ---------------------------------------------------------
  // The waiting room shows whenever there is no active round (before the game
  // and between rounds). The countdown resets each time we return to it, then a
  // fresh round auto-starts when it hits zero.
  const waitStartRef = useRef(Date.now());
  useEffect(() => {
    // Entered the waiting room (no active round) → restart the countdown.
    if (!round.active) waitStartRef.current = Date.now();
  }, [round.active]);

  const lobbySecondsLeft = round.active
    ? 0
    : Math.max(0, Math.ceil((waitStartRef.current + LOBBY_WAIT_MS - now) / 1000));

  // When the countdown ends, start the next round. Any connected client may fire
  // it — the round derivation + startRound's debounce dedupe it, so it doesn't
  // depend on presence being populated.
  useEffect(() => {
    if (round.active || lobbySecondsLeft > 0 || !meId) return;
    startRound();
  }, [round.active, lobbySecondsLeft, meId, startRound]);

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
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            Pict<span className="text-accent">-Portal</span>
          </h1>
          <div className="flex items-center gap-5">
            <span className="font-mono tracking-widest text-white/80">
              Room:{roomCode}
            </span>
            <Status status={game.status} />
            <div className="flex items-center gap-1.5 text-xs text-white/50">
              {game.presence?.count ?? 1} online · you are{" "}
              <PlayerBadge name={name} />
              <span className="text-white/80">{name}</span>
            </div>
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
                    <span className="inline-flex items-center gap-1.5 text-white/60">
                      <PlayerBadge name={round.drawerName} />
                      {round.drawerName} is drawing
                    </span>{" "}
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
            <div className="flex w-full items-center justify-between">
              <div className="text-sm">
                <div className="font-medium text-white/80">Waiting room</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {roster.map((id) => {
                    const n = id === meId ? name : nameById.get(id) ?? "player";
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/70"
                      >
                        <PlayerBadge name={n} />
                        {n}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-1 text-xs text-white/40">
                  Game starts in {lobbySecondsLeft}s — waiting for players. Anyone can
                  press Start.
                </div>
              </div>
              <button
                onClick={startRound}
                disabled={!meId}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Start now
              </button>
            </div>
          )}
        </div>

        <Canvas key={round.id} isDrawer={isDrawer} snapshotRef={snapshotRef} roomCode={roomCode} />

        <Scoreboard scores={scores} />
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

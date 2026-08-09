"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChannel } from "@portalsdk/react";
import Canvas from "./Canvas";
import Chat, { FeedItem } from "./Chat";
import PlayerBadge from "./PlayerBadge";
import PlayersPanel, { PlayerRow } from "./PlayersPanel";
import Scoreboard from "./Scoreboard";
import Status from "./Status";
import ThemeToggle from "./ThemeToggle";
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

export default function Game({
  name,
  roomCode,
  onLeave,
}: {
  name: string;
  roomCode: string;
  onLeave: () => void;
}) {
  // ---- Channels -------------------------------------------------------------
  // Players who just hit "Leave" — excluded from the roster the instant their
  // player-left broadcast arrives, instead of waiting out the activity
  // heartbeat's ~5s expiry. Self-clears after a few seconds so it never
  // permanently blocks the same (session-stable, anonymous) id from
  // reappearing if they rejoin.
  const [justLeftIds, setJustLeftIds] = useState<Set<string>>(() => new Set());

  const game = useChannel<GameMsg>({
    channelId: gameChannel(roomCode),
    metadata: { name },
    onMessage: (m) => {
      if (m.content.kind !== "player-left") return;
      const id = m.content.playerId;
      setJustLeftIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      setTimeout(() => {
        setJustLeftIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 6000);
    },
  });

  // Display names, keyed by player id — kept current via our own
  // `name-update` broadcast (see the effect below) rather than presence
  // `metadata`, which only seeds a *new* channel handle and doesn't actually
  // get re-announced by `setMetadata()` on this backend (verified live).
  // Derived from `game.messages` (not accumulated via onMessage): onMessage
  // only fires for messages delivered live, never for ones a late joiner
  // gets from history backfill — reading `messages` instead covers both, the
  // same way the round derivation below does.
  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of game.messages) {
      if (m.content.kind === "name-update") map.set(m.content.playerId, m.content.name);
    }
    return map;
  }, [game.messages]);

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

  // The initial history page isn't fetched automatically on connect (verified
  // live: `messages` comes back empty with `hasPrevious: true` until this is
  // called at least once) — without it, a late joiner's `game.messages` is
  // missing everything that happened before they connected: the active
  // round's round-start, and other players' name-update broadcasts.
  const loadedGameHistory = useRef(false);
  useEffect(() => {
    if (game.status !== "ready" || loadedGameHistory.current) return;
    loadedGameHistory.current = true;
    void game.loadPrevious();
  }, [game.status, game.loadPrevious]);

  const loadedChatHistory = useRef(false);
  useEffect(() => {
    if (chat.status !== "ready" || loadedChatHistory.current) return;
    loadedChatHistory.current = true;
    void chat.loadPrevious();
  }, [chat.status, chat.loadPrevious]);


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

  // Tell everyone our current name — on first join, and again if it ever
  // changes (e.g. Leave then rejoin under a new name in the same tab).
  useEffect(() => {
    if (!meId) return;
    void game.send({ content: { kind: "name-update", playerId: meId, name } });
  }, [meId, name, game.send]);

  // ---- Liveness heartbeat ----------------------------------------------------
  // Portal's own `presence` reflects the socket's state server-side, which can
  // lag well behind an actual disconnect (a clean tab close alone can take
  // ~30s+ to propagate as a "leave", longer for a crash/network drop — there's
  // no client knob to tighten that). `activity` entries instead self-expire on
  // every OTHER client after ACTIVITY_EXPIRY_MS (5s) if they stop arriving, so
  // pinging "online" here gives everyone a roster that actually clears out
  // within seconds of someone disappearing, regardless of why.
  useEffect(() => {
    if (!meId) return;
    const ping = game.sendActivity;
    ping("online");
    const iv = setInterval(() => ping("online"), 3500);
    return () => clearInterval(iv);
  }, [meId, game.sendActivity]);

  // ---- Turn rotation: who draws next ---------------------------------------
  // Everyone currently pinging "online" (see heartbeat above), plus ourselves
  // so we never briefly vanish from our own list before our first ping echoes
  // back, sorted so every client agrees on the order.
  const roster = useMemo(() => {
    const ids = new Set<string>();
    for (const a of game.activity) {
      if (a.kind === "online") ids.add(a.userId);
    }
    if (meId) ids.add(meId);
    for (const id of justLeftIds) ids.delete(id);
    return [...ids].sort();
  }, [game.activity, meId, justLeftIds]);


  const players: PlayerRow[] = useMemo(() => {
    return roster.map((id) => ({
      id,
      name: id === meId ? name : namesById.get(id) ?? "player",
      isMe: id === meId,
      isDrawer: round.active && id === round.drawerId,
      isTyping: chat.typing.includes(id),
    }));
  }, [roster, meId, name, namesById, round.active, round.drawerId, chat.typing]);

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

  // A deliberate "Leave" click is a controlled moment, unlike a crash/dropped
  // connection: we can announce it explicitly instead of leaving everyone
  // else to *infer* we're gone, which is bounded by Portal's ~5s
  // activity-expiry floor (see the roster effect below). Ephemeral — this is
  // a one-off signal, not something a late joiner needs replayed.
  function handleLeave() {
    if (meId) void game.send({ content: { kind: "player-left", playerId: meId } });
    if (isDrawer && round.active) {
      void chat.send({
        content: {
          kind: "system",
          text: `${name} left — round ended. Anyone can start a new one.`,
        },
      });
      endRound();
    }
    onLeave();
  }

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

  // ---- Abandoned round: the drawer disconnected ------------------------------
  // Fallback path for a crash/dropped connection — a deliberate "Leave" click
  // is handled instantly by handleLeave() above, which sends its own
  // round-end before the drawer even disconnects. This path exists for the
  // case where there's no chance to say goodbye: `roster` only drops the
  // drawer once their activity ping hasn't been renewed for
  // ACTIVITY_EXPIRY_MS (a fixed 5s inside the Portal SDK, not something we
  // can configure), so ~5s is the fastest this path can ever detect a real
  // disconnect. Only the drawer's own browser knows the word and validates
  // guesses (see the chat onMessage handler above), so once they're gone
  // nobody can mark a guess correct — end the round early instead of making
  // everyone wait out the full 90s timer.
  const drawerMissing =
    round.active && !!round.drawerId && !roster.includes(round.drawerId);
  // Only the lowest-sorted currently-present id acts, so connected clients don't
  // all race to publish the same round-end at once.
  const isAbandonLeader = drawerMissing && roster.length > 0 && roster[0] === meId;

  const abandonedRoundIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isAbandonLeader) return;
    const sendChat = chat.send;
    const sendGame = game.send;
    const drawerName = round.drawerName;
    const roundId = round.id;
    const timer = setTimeout(() => {
      if (abandonedRoundIdRef.current === roundId) return;
      abandonedRoundIdRef.current = roundId;
      void sendChat({
        content: {
          kind: "system",
          text: `${drawerName} left — round ended. Anyone can start a new one.`,
        },
      });
      void sendGame({ content: { kind: "round-end", word: "?" } });
    }, 1500); // short extra grace on top of the ~5s floor above, tuned down
    // from an earlier 6s now that this path only ever fires for real
    // disconnects (deliberate leaves take the instant path instead)
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chat.send/game.send
    // are the stable pieces; the whole `chat`/`game` objects are recreated every
    // render (useChannel doesn't memoize its return value) and would reset this
    // timer before it ever fires.
  }, [isAbandonLeader, round.id, round.drawerName, chat.send, game.send]);

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

  // Connecting to Portal (minting an anonymous identity + subscribing to
  // each channel) reliably takes a couple of seconds — verified against the
  // live backend, not something a client-side tweak can shrink much
  // further. Cover the real UI with a deliberate loading veil instead of
  // letting it limp in piecemeal (empty roster, "0 online", an
  // unresponsive canvas), which reads as broken rather than "still
  // loading" — but keep everything mounted underneath (rather than an
  // early return) so Canvas's own draw-channel connection still starts
  // immediately, in parallel with game/chat, instead of waiting for them.
  const connecting = game.status !== "ready" || chat.status !== "ready";

  return (
    <div className="relative mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:h-screen lg:flex-row">
      {connecting && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fg/20 border-t-accent" />
            <p className="text-sm text-fg/60">Connecting to room {roomCode}…</p>
            <button onClick={onLeave} className="text-xs text-fg/40 underline hover:text-fg/60">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Left: players panel */}
      <PlayersPanel players={players} />

      {/* Center: canvas + status */}
      <div className="flex flex-1 flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleLeave}
              className="flex items-center gap-1 rounded-md border border-edge px-2.5 py-1 text-sm text-fg/60 hover:bg-fg/5 hover:text-fg/90"
              title="Leave room"
            >
              ← Leave
            </button>
            <h1 className="text-lg font-semibold">
              Pict<span className="text-accent">-Portal</span>
            </h1>
          </div>
          <div className="flex items-center gap-5">
            <span className="font-mono tracking-widest text-fg/80">
              Room:{roomCode}
            </span>
            <Status status={game.status} />
            <div className="flex items-center gap-1.5 text-xs text-fg/50">
              you are <PlayerBadge name={name} />
              <span className="text-fg/80">{name}</span>
            </div>
            <ThemeToggle />
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
                    <span className="inline-flex items-center gap-1.5 text-fg/60">
                      <PlayerBadge name={round.drawerName} />
                      {round.drawerName} is drawing
                    </span>{" "}
                    <span className="ml-2 font-mono tracking-widest text-fg/90">
                      {round.masked}
                    </span>
                  </>
                )}
              </div>
              <div
                className={`font-mono text-lg ${
                  secondsLeft <= 10 ? "text-red-400" : "text-fg/70"
                }`}
              >
                {secondsLeft}s
              </div>
            </>
          ) : (
            <div className="flex w-full items-center justify-between">
              <div className="text-sm">
                <div className="font-medium text-fg/80">Waiting room</div>
                <div className="mt-1 text-xs text-fg/40">
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
          onTyping={() => chat.sendTyping()}
        />
      </div>
    </div>
  );
}

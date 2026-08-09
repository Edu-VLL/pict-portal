// Shared message shapes for each Portal channel.

// draw:<room>  — high-frequency ephemeral stroke deltas from the current drawer.
export type StrokePoint = { x: number; y: number };

export type DrawMsg =
  | {
      kind: "stroke";
      points: StrokePoint[];
      // A literal hex, or the sentinel "auto" for the theme-default ink
      // swatch — that one only makes sense relative to *your own* canvas
      // background, so each viewer resolves it against their own local
      // theme on receipt instead of everyone sharing the drawer's literal
      // color (which could be invisible if their themes don't match).
      color: string;
      size: number;
    }
  | { kind: "clear" };

// chat:<room>  — guesses (humans + AI) and system events. Persistent.
export type ChatMsg =
  | { kind: "guess"; name: string; text: string; ai?: boolean }
  | { kind: "system"; text: string }
  | {
      kind: "correct";
      name: string;
      word: string;
      ai?: boolean;
      // Who actually won, for the client that should celebrate. Matching on
      // `name` would misfire if two people picked the same one.
      playerId?: string;
    };

// game:<room>  — round control, published by whoever is drawing.
export type GameMsg =
  | {
      kind: "round-start";
      drawerId: string;
      drawerName: string;
      masked: string; // e.g. "_ _ _ _" (length hint, no letters)
      endsAt: number; // epoch ms
      // The AI is drawing this round. `drawerId` still points at the human
      // who started it — the bot has no session of its own, so that client
      // hosts the round: it fetches the strokes, publishes them, and holds
      // the word to validate guesses, exactly as a human drawer would.
      aiDrawing?: boolean;
    }
  | { kind: "round-end"; word: string; winner?: string; ai?: boolean }
  // A deliberate departure (the "Leave" button) — lets everyone drop this
  // player from the roster immediately instead of waiting out the activity
  // heartbeat's expiry window. (Sent as a regular persistent message: the
  // SDK silently drops incoming `ephemeral: true` sends rather than
  // delivering them, so that flag isn't usable for this.)
  | { kind: "player-left"; playerId: string }
  // Broadcasts this session's display name. Presence `metadata` only seeds a
  // *new* channel handle and `setMetadata()` doesn't actually get
  // re-announced by the server (verified against the live backend — the
  // docs claim otherwise), so it's the only reliable way for a renamed or
  // rejoined player's name to reach everyone else.
  | { kind: "name-update"; playerId: string; name: string }
  // Whether the AI competes as a player. Room-wide rather than per-client so
  // everyone's roster agrees — the guessing loop itself only ever runs on the
  // drawer's machine, so a local-only flag would let one player silently
  // disable a bot everyone else still sees listed.
  | { kind: "ai-toggle"; enabled: boolean }
  // Anyone can ask for a clue or a different word, but only the client that
  // holds the word (the drawer, or the host of an AI turn) can act on it —
  // so the ask is broadcast and that client answers.
  | { kind: "round-request"; what: "hint" | "skip" };

export const ROOM = "main";
export const drawChannel = (roomCode = ROOM) => `draw:${roomCode}`;
export const chatChannel = (roomCode = ROOM) => `chat:${roomCode}`;
export const gameChannel = (roomCode = ROOM) => `game:${roomCode}`;

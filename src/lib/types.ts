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
    };

// game:<room>  — round control, published by whoever is drawing.
export type GameMsg =
  | {
      kind: "round-start";
      drawerId: string;
      drawerName: string;
      masked: string; // e.g. "_ _ _ _" (length hint, no letters)
      endsAt: number; // epoch ms
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
  | { kind: "name-update"; playerId: string; name: string };

export const ROOM = "main";
export const drawChannel = (roomCode = ROOM) => `draw:${roomCode}`;
export const chatChannel = (roomCode = ROOM) => `chat:${roomCode}`;
export const gameChannel = (roomCode = ROOM) => `game:${roomCode}`;

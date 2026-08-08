// Shared message shapes for each Portal channel.

// draw:<room>  — high-frequency ephemeral stroke deltas from the current drawer.
export type StrokePoint = { x: number; y: number };

export type DrawMsg =
  | { kind: "stroke"; points: StrokePoint[]; color: string; size: number }
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
  | { kind: "round-end"; word: string; winner?: string; ai?: boolean };

export const ROOM = "main";
export const drawChannel = (roomCode = ROOM) => `draw:${roomCode}`;
export const chatChannel = (roomCode = ROOM) => `chat:${roomCode}`;
export const gameChannel = (roomCode = ROOM) => `game:${roomCode}`;

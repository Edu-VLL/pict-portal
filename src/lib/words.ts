// Simple word bank for rounds. Concrete, drawable nouns.
export const WORDS = [
  "cat", "dog", "house", "tree", "car", "sun", "boat", "fish", "star", "apple",
  "flower", "clock", "book", "key", "cup", "hat", "shoe", "guitar", "rocket",
  "umbrella", "bicycle", "pizza", "banana", "snake", "ladder", "cloud", "moon",
  "camera", "glasses", "spider", "crown", "robot", "cactus", "lighthouse",
  "mountain", "bridge", "envelope", "balloon", "anchor", "mushroom",
];

export function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

// Length hint shown to guessers, e.g. "cat" -> "_ _ _".
export function maskWord(word: string): string {
  return word
    .split("")
    .map((c) => (c === " " ? " " : "_"))
    .join(" ");
}

// Fallback clue when the AI hint is unavailable: the masked word with `count`
// letters uncovered, always including the first one so it reads as a hint
// rather than noise. Deterministic per (word, count) so repeat calls with the
// same count don't shuffle which letters are showing.
export function revealLetters(word: string, count: number): string {
  const chars = word.split("");
  const idxs = chars.map((_, i) => i).filter((i) => chars[i] !== " ");
  const shown = new Set<number>();
  if (idxs.length > 0) shown.add(idxs[0]);
  // Walk at a fixed stride so successive hints keep earlier reveals visible.
  const stride = Math.max(2, Math.floor(idxs.length / Math.max(1, count)));
  for (let k = stride; k < idxs.length && shown.size < count; k += stride) {
    shown.add(idxs[k]);
  }
  return chars.map((c, i) => (c === " " ? " " : shown.has(i) ? c : "_")).join(" ");
}

// Compare a guess against the target word: case-insensitive, trims
// surrounding whitespace, but otherwise requires an exact match.
export function isCorrect(guess: string, word: string): boolean {
  const g = guess.trim().toLowerCase();
  const w = word.trim().toLowerCase();
  if (!g) return false;
  return g === w;
}

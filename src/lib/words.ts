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

// Compare a guess against the target word: case-insensitive, trims
// surrounding whitespace, but otherwise requires an exact match.
export function isCorrect(guess: string, word: string): boolean {
  const g = guess.trim().toLowerCase();
  const w = word.trim().toLowerCase();
  if (!g) return false;
  return g === w;
}

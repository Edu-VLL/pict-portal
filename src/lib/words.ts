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

// Fuzzy compare a guess against the target word: case-insensitive,
// trims, and tolerates one-character typos (Levenshtein <= 1).
export function isCorrect(guess: string, word: string): boolean {
  const g = guess.trim().toLowerCase();
  const w = word.trim().toLowerCase();
  if (!g) return false;
  if (g === w) return true;
  return levenshtein(g, w) <= 1 && Math.abs(g.length - w.length) <= 1;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

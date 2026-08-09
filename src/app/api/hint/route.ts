import { NextRequest, NextResponse } from "next/server";

// Server-only route: the AI gives a clue about the word without naming it.
// Used when a round stalls and nobody is landing the guess.
//
// Uses Google Gemini (free tier). Get a key at https://aistudio.google.com/apikey

export const runtime = "nodejs";

type HintResult = { ok: boolean; hint?: string; reason?: string };

export async function POST(req: NextRequest): Promise<NextResponse<HintResult>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  if (!apiKey) return NextResponse.json({ ok: false, reason: "no_api_key" });

  let word: string | undefined;
  let previous: string[] = [];
  try {
    const body = (await req.json()) as { word?: string; previous?: string[] };
    word = typeof body.word === "string" ? body.word.trim() : undefined;
    previous = Array.isArray(body.previous)
      ? body.previous.filter((p): p is string => typeof p === "string").slice(0, 5)
      : [];
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (!word) return NextResponse.json({ ok: false, reason: "no_word" }, { status: 400 });

  const prompt =
    `We're playing Pictionary. The secret word is "${word}". ` +
    `Players are stuck, so give ONE short clue (max 12 words).\n` +
    `Rules: never write the word itself or any part of it, and don't rhyme it or ` +
    `spell it out. Describe what it is, where you'd find it, or what it's used for.\n` +
    (previous.length
      ? `Clues already given (say something new): ${previous.join(" | ")}\n`
      : "") +
    `Reply with STRICT JSON only, no prose, no code fences: {"hint":"<your clue>"}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.9 },
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error(`[api/hint] Gemini ${res.status}`);
      return NextResponse.json({ ok: false, reason: `gemini_${res.status}` }, { status: 502 });
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    const hint = parseHint(text);
    if (!hint) return NextResponse.json({ ok: false, reason: "unparseable" });

    // Never ship a "clue" that contains the answer — the model occasionally
    // ignores that instruction, and it would end the round instantly.
    if (hint.toLowerCase().includes(word.toLowerCase())) {
      return NextResponse.json({ ok: false, reason: "leaked_word" });
    }
    return NextResponse.json({ ok: true, hint });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = (err as Error).name === "AbortError";
    return NextResponse.json(
      { ok: false, reason: isAbort ? "timeout" : "fetch_error" },
      { status: 502 },
    );
  }
}

function parseHint(text: string): string | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as { hint?: unknown };
      if (typeof obj.hint === "string" && obj.hint.trim()) return obj.hint.trim();
    } catch {
      /* fall through to the plain-text salvage below */
    }
  }
  // The clue is short enough that a bare sentence is still usable.
  const plain = cleaned.replace(/^["']|["']$/g, "").trim();
  return plain && plain.length <= 160 ? plain : null;
}

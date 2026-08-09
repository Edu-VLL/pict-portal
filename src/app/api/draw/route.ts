import { NextRequest, NextResponse } from "next/server";

// Server-only route: the AI takes its turn as the *drawer*. Given a word, it
// returns a doodle as normalized polylines (0..1) that the client scales to
// the canvas and plays back progressively, so viewers watch it appear stroke
// by stroke exactly like a human drawing.
//
// Uses Google Gemini (free tier). Get a key at https://aistudio.google.com/apikey

export const runtime = "nodejs";

type Point = { x: number; y: number };
type Stroke = { points: Point[] };
type DrawResult = { ok: boolean; strokes?: Stroke[]; reason?: string };

export async function POST(req: NextRequest): Promise<NextResponse<DrawResult>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "no_api_key" });
  }

  let word: string | undefined;
  try {
    const body = (await req.json()) as { word?: string };
    word = typeof body.word === "string" ? body.word.trim() : undefined;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (!word) {
    return NextResponse.json({ ok: false, reason: "no_word" }, { status: 400 });
  }

  const prompt =
    `You are playing Pictionary and it's your turn to DRAW the word "${word}".\n` +
    `Produce a simple, bold line drawing that a human can recognize — like a whiteboard doodle.\n` +
    `Reply with STRICT JSON only, no prose, no code fences:\n` +
    `{"strokes":[{"points":[[x,y],[x,y],...]}, ...]}\n` +
    `Rules: coordinates are normalized floats 0..1 ("x" left to right, "y" top to bottom).\n` +
    `Use 3-12 strokes. Each stroke is a connected polyline of 2-40 points.\n` +
    `Fill the canvas: span roughly x 0.15-0.85 and y 0.15-0.85. Draw the whole object, centered.\n` +
    `For curves, emit many short segments. Close shapes by repeating the first point at the end.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.6 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[api/draw] Gemini ${res.status}:`, detail.slice(0, 400));
      return NextResponse.json(
        { ok: false, reason: `gemini_${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const strokes = parseStrokes(text);
    if (!strokes) {
      console.error("[api/draw] unparseable. Raw:", JSON.stringify(text).slice(0, 300));
      return NextResponse.json({ ok: false, reason: "unparseable" });
    }
    console.log(`[api/draw] drew "${word}" as ${strokes.length} strokes`);
    return NextResponse.json({ ok: true, strokes });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = (err as Error).name === "AbortError";
    const reason = isAbort ? "timeout" : `fetch_error: ${(err as Error).message}`;
    console.error(`[api/draw] ${reason}`);
    return NextResponse.json({ ok: false, reason }, { status: 502 });
  }
}

function parseStrokes(text: string): Stroke[] | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  // This model is unreliable about how it terminates the object: observed
  // both an extra trailing "}" and a missing one entirely (with
  // finishReason STOP, so it isn't truncation). Try, in order: walking back
  // from each "}" (drops trailing junk), then re-balancing whatever brackets
  // were left open (repairs a missing tail).
  let obj: unknown = null;
  for (let end = cleaned.lastIndexOf("}"); end > start; end = cleaned.lastIndexOf("}", end - 1)) {
    try {
      obj = JSON.parse(cleaned.slice(start, end + 1));
      break;
    } catch {
      /* try the next-shorter candidate */
    }
  }
  if (obj === null) {
    try {
      obj = JSON.parse(closeBrackets(cleaned.slice(start)));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const raw = (obj as { strokes?: unknown }).strokes;
  if (!Array.isArray(raw)) return null;

  const strokes: Stroke[] = [];
  for (const entry of raw) {
    // Accept both {points:[[x,y],...]} and a bare [[x,y],...] — the model
    // switches between the two shapes run to run.
    const pts = Array.isArray(entry)
      ? entry
      : Array.isArray((entry as { points?: unknown }).points)
        ? (entry as { points: unknown[] }).points
        : null;
    if (!pts) continue;

    const points: Point[] = [];
    for (const p of pts) {
      let x: unknown, y: unknown;
      if (Array.isArray(p)) [x, y] = p;
      else if (p && typeof p === "object") {
        x = (p as { x?: unknown }).x;
        y = (p as { y?: unknown }).y;
      }
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x: clamp01(x), y: clamp01(y) });
    }
    if (points.length >= 2) strokes.push({ points });
  }

  return strokes.length > 0 ? strokes : null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Append whatever `]`/`}` the model left unclosed, innermost first. */
function closeBrackets(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  // A dangling `,` or a half-written number would still fail to parse, which
  // is fine — the caller treats that as "no drawing this time".
  return s + (inString ? '"' : "") + stack.reverse().join("");
}

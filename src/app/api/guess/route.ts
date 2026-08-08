import { NextRequest, NextResponse } from "next/server";

// Server-only route: the AI looks at the current doodle and guesses what it is.
// The target word is NEVER sent here — the model has to actually recognize the
// drawing, and the client decides if the guess matches.

export const runtime = "nodejs";

type GuessResult = { ok: boolean; guess?: string; alternatives?: string[]; reason?: string };

export async function POST(req: NextRequest): Promise<NextResponse<GuessResult>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

  if (!apiKey) {
    // No key configured — the realtime game still works, the AI just sits out.
    return NextResponse.json({ ok: false, reason: "no_api_key" });
  }

  let dataUrl: string | undefined;
  try {
    const body = (await req.json()) as { image?: string };
    dataUrl = body.image;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (!dataUrl?.startsWith("data:image/")) {
    return NextResponse.json({ ok: false, reason: "bad_image" }, { status: 400 });
  }

  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const mediaType = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";

  const prompt =
    "We're playing Pictionary. This is an in-progress doodle on a dark canvas. " +
    "Guess what is being drawn. Reply with STRICT JSON only, no prose, no code fences: " +
    '{"guess":"<one common noun>","alternatives":["<noun>","<noun>"]}. ' +
    "Use simple, singular, lowercase everyday nouns. If it's too early to tell, still give your best guess.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { ok: false, reason: `anthropic_${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const parsed = parseGuess(text);
    if (!parsed) return NextResponse.json({ ok: false, reason: "unparseable" });
    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: `fetch_error: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}

function parseGuess(text: string): { guess: string; alternatives: string[] } | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
      guess?: unknown;
      alternatives?: unknown;
    };
    const guess = typeof obj.guess === "string" ? obj.guess.trim().toLowerCase() : "";
    if (!guess) return null;
    const alternatives = Array.isArray(obj.alternatives)
      ? obj.alternatives
          .filter((a): a is string => typeof a === "string")
          .map((a) => a.trim().toLowerCase())
          .slice(0, 4)
      : [];
    return { guess, alternatives };
  } catch {
    return null;
  }
}

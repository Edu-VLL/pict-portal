# Pict-Portal 🎨🤖

Realtime multiplayer **Pictionary where an AI plays alongside humans** — it watches
your strokes as you draw and races everyone to guess the word. Built on
[Portal](https://useportal.co) for the realtime layer and a vision model for the AI.

Made for **The Realtime Hackathon by Portal**. It satisfies both eligibility rules:
an AI capability (live doodle recognition) **and** meaningful realtime interaction
between multiple users + an AI agent, all over Portal channels.

---

## How it works

Three Portal channels carry the whole game (all in anonymous mode — just the `pk_`):

| Channel        | Purpose                                                        |
| -------------- | ------------------------------------------------------------- |
| `draw:main`    | The drawer's strokes, streamed as **ephemeral** messages so every viewer paints them in real time. |
| `chat:main`    | Guesses (humans **and** the AI) + system events. Persistent, so late joiners see history. |
| `game:main`    | Round control: `round-start` / `round-end`, published by whoever is drawing. |

The **AI guesser** lives in `src/app/api/guess/route.ts`. While you draw, your browser
snapshots the canvas every ~1.8s and sends the PNG to that route, which asks a vision
model *"what is this?"* — **the target word is never sent to the model**, so it has to
genuinely recognize the drawing. The guess is published to `chat:main`, and if it
matches the word, the AI wins the round.

The **drawer's browser is the authority**: it holds the secret word, validates every
human guess (case-insensitive, tolerates one typo), and ends the round — so there's a
single source of truth with no extra backend.

---

## 1. Prerequisites

- **Node.js 18.18+** (20 or 22 recommended). Check with `node --version`.
  If you don't have it: install the LTS from [nodejs.org](https://nodejs.org) or
  `brew install node`.

## 2. Set up Portal (one time)

```bash
npm install -g @portalsdk/cli
portal login            # opens a browser — click Approve
portal whoami           # confirm you're signed in

portal projects create pict-portal      # note the production env id it prints
portal keys create --env <ENV_ID> --type public   # prints a pk_...
portal keys create --env <ENV_ID> --type secret   # prints an sk_...
```

If you deploy beyond localhost later:

```bash
portal origins add https://<your-domain> --env <ENV_ID>
```

## 3. Configure env

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

- `NEXT_PUBLIC_PORTAL_KEY` = your `pk_...` (safe in the browser)
- `PORTAL_SECRET` = your `sk_...` (**never commit this**; it's git-ignored)
- `ANTHROPIC_API_KEY` = a key for the AI guesser (server-side only)
- `ANTHROPIC_MODEL` = a vision-capable model (default `claude-3-5-sonnet-latest`)

> The game runs **without** the AI key — the realtime drawing/guessing still works,
> the AI simply sits out. Add the key to enable the AI player.

## 4. Run

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in **two browser tabs** (or share your machine on the
network). Enter a name in each. In one tab click **"I'll draw"**, start sketching, and
watch the other tab render it live while the AI guesses in the chat.

---

## Demo script (for the 2-minute pitch)

1. Two tabs side by side, both joined. Point out the live presence count.
2. Tab A clicks **I'll draw**, gets a word (e.g. *rocket*). Start drawing slowly.
3. Tab B sees strokes appear in real time — that's Portal fan-out.
4. The **🤖 AI** starts guessing in chat as the shape forms: *"pencil… tower… rocket!"*
5. Whoever nails it first (human or AI) wins — scoreboard updates for everyone live.
6. One line to land it: *"People, an AI agent, and live data all sharing one realtime
   surface — that's the whole point of Portal."*

---

## Project layout

```
src/
  app/
    page.tsx            # Lobby -> Game, wrapped in <PortalProvider>
    api/guess/route.ts  # server-only vision call (AI guesser)
  components/
    Canvas.tsx          # drawing + streaming/rendering strokes over Portal
    Chat.tsx            # guess feed + input
    Game.tsx            # channels, rounds, scoring, AI loop (orchestrator)
    Lobby.tsx           # name entry
  lib/
    portal.ts           # Portal client (anonymous mode)
    types.ts            # channel message shapes + channel ids
    words.ts            # word bank, masking, fuzzy match
```

## Ideas to push it further this weekend

- **AI draws too**: on its turn, generate strokes and publish them incrementally.
- **Live cursors** of the drawer's pen via Portal presence metadata.
- **In-app notifications** (Portal inbox) to ping players when a new round starts.
- **Rooms**: make the room id a URL param instead of the fixed `main`.
- **Reactions**: ephemeral emoji fan-out over a `reactions:main` channel.
```

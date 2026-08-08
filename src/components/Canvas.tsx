"use client";

import {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useChannel } from "@portalsdk/react";
import { DrawMsg, StrokePoint, drawChannel } from "@/lib/types";

const W = 900;
const H = 600;
const BG = "#0f1115";
const COLORS = ["#e6e8ec", "#6366f1", "#ef4444", "#22c55e", "#eab308", "#f97316"];
const SIZES = [3, 6, 12, 22];

export default function Canvas({
  isDrawer,
  snapshotRef,
}: {
  isDrawer: boolean;
  // Parent stores a function here to grab a PNG data URL of the current canvas.
  snapshotRef?: MutableRefObject<(() => string | null) | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const lastSent = useRef<StrokePoint | null>(null);
  const buffer = useRef<StrokePoint[]>([]);
  const lastFlush = useRef(0);

  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);

  const { send, me } = useChannel<DrawMsg>({
    channelId: drawChannel(),
    history: "none",
    onMessage: (msg) => {
      // Ignore our own echoes — the drawer already painted locally.
      if (msg.sender?.id && me?.id && msg.sender.id === me.id) return;
      applyRemote(msg.content);
    },
  });

  const getCtx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    if (!ctxRef.current) {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctxRef.current = ctx;
      }
    }
    return ctxRef.current;
  }, []);

  const paintSegment = useCallback(
    (points: StrokePoint[], strokeColor: string, strokeSize: number) => {
      const ctx = getCtx();
      if (!ctx || points.length === 0) return;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeSize;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      if (points.length === 1) {
        // A single tap — draw a dot.
        ctx.lineTo(points[0].x + 0.1, points[0].y + 0.1);
      }
      ctx.stroke();
    },
    [getCtx],
  );

  const clearCanvas = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  }, [getCtx]);

  const applyRemote = useCallback(
    (msg: DrawMsg) => {
      if (msg.kind === "clear") clearCanvas();
      else paintSegment(msg.points, msg.color, msg.size);
    },
    [clearCanvas, paintSegment],
  );

  // Init + expose snapshot getter.
  useEffect(() => {
    clearCanvas();
    if (snapshotRef) {
      snapshotRef.current = () => {
        const c = canvasRef.current;
        return c ? c.toDataURL("image/png") : null;
      };
    }
    return () => {
      if (snapshotRef) snapshotRef.current = null;
    };
  }, [clearCanvas, snapshotRef]);

  function toCanvasPoint(e: ReactPointerEvent<HTMLCanvasElement>): StrokePoint {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function flush(force = false) {
    const now = performance.now();
    if (!force && now - lastFlush.current < 40) return;
    if (buffer.current.length === 0) return;
    const points = buffer.current;
    buffer.current = [];
    lastFlush.current = now;
    void send({ ephemeral: true, content: { kind: "stroke", points, color, size } });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = toCanvasPoint(e);
    lastSent.current = p;
    buffer.current = [p];
    paintSegment([p], color, size);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawer || !drawing.current) return;
    const p = toCanvasPoint(e);
    // Paint locally through the last point for a continuous line.
    if (lastSent.current) paintSegment([lastSent.current, p], color, size);
    buffer.current.push(p);
    lastSent.current = p;
    flush();
  }

  function endStroke() {
    if (!isDrawer || !drawing.current) return;
    drawing.current = false;
    flush(true);
    lastSent.current = null;
  }

  function onClear() {
    clearCanvas();
    void send({ ephemeral: true, content: { kind: "clear" } });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl border border-edge bg-ink">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="aspect-[3/2] w-full"
          style={{ cursor: isDrawer ? "crosshair" : "not-allowed" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
        {!isDrawer && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white/70">
            watching
          </div>
        )}
      </div>

      {isDrawer && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === c ? "border-white" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`grid h-8 w-8 place-items-center rounded-md border ${
                  size === s ? "border-accent bg-accent/20" : "border-edge"
                }`}
              >
                <span
                  className="rounded-full bg-white"
                  style={{ width: s, height: s }}
                />
              </button>
            ))}
          </div>
          <button
            onClick={onClear}
            className="ml-auto rounded-md border border-edge px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

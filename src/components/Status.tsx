type ChannelStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "degraded"
  | "degraded-http"
  | "blocked";

const LABEL: Record<ChannelStatus, string> = {
  idle: "Sin conectar",
  connecting: "Conectando…",
  ready: "Conectado",
  reconnecting: "Reconectando…",
  degraded: "Degradado",
  "degraded-http": "Degradado",
  blocked: "Bloqueado",
};

const DOT: Record<ChannelStatus, string> = {
  idle: "bg-white/30",
  connecting: "bg-yellow-400 animate-pulse",
  ready: "bg-green-400",
  reconnecting: "bg-yellow-400 animate-pulse",
  degraded: "bg-yellow-400",
  "degraded-http": "bg-yellow-400",
  blocked: "bg-red-500",
};

export default function Status({ status }: { status: ChannelStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
      <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
      {LABEL[status]}
    </span>
  );
}

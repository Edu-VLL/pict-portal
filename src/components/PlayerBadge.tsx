import { colorForName, initialsFor } from "@/lib/players";

export default function PlayerBadge({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";
  return (
    <span
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ background: colorForName(name) }}
      title={name}
    >
      {initialsFor(name)}
    </span>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pict-Portal — draw with an AI, live",
  description:
    "Realtime multiplayer Pictionary where an AI plays alongside you. Built on Portal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

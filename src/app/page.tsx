"use client";

import { useState } from "react";
import { PortalProvider } from "@portalsdk/react";
import { portal } from "@/lib/portal";
import Lobby from "@/components/Lobby";
import Game from "@/components/Game";

export default function Page() {
  const [session, setSession] = useState<{ name: string; roomCode: string } | null>(null);

  return (
    <PortalProvider client={portal}>
      {session ? (
        <Game name={session.name} roomCode={session.roomCode} />
      ) : (
        <Lobby onJoin={(name, roomCode) => setSession({ name, roomCode })} />
      )}
    </PortalProvider>
  );
}

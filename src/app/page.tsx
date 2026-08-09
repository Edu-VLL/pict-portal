"use client";

import { useState } from "react";
import { PortalProvider } from "@portalsdk/react";
import { portal } from "@/lib/portal";
import Lobby from "@/components/Lobby";
import Game from "@/components/Game";

export default function Page() {
  const [session, setSession] = useState<{
    name: string;
    roomCode: string;
    totalRounds?: number;
  } | null>(null);

  return (
    <PortalProvider client={portal}>
      {session ? (
        <Game
          name={session.name}
          roomCode={session.roomCode}
          totalRounds={session.totalRounds}
          onLeave={() => setSession(null)}
        />
      ) : (
        <Lobby
          onJoin={(name, roomCode, totalRounds) =>
            setSession({ name, roomCode, totalRounds })
          }
        />
      )}
    </PortalProvider>
  );
}

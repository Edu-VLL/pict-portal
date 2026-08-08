"use client";

import { useState } from "react";
import { PortalProvider } from "@portalsdk/react";
import { portal } from "@/lib/portal";
import Lobby from "@/components/Lobby";
import Game from "@/components/Game";

export default function Page() {
  const [name, setName] = useState<string | null>(null);

  return (
    <PortalProvider client={portal}>
      {name ? <Game name={name} /> : <Lobby onJoin={setName} />}
    </PortalProvider>
  );
}

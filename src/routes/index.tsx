import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TownApp } from "@/components/town/TownApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(true);
  }, []);
  if (!on) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-fg">
        <h1 className="font-display text-4xl">THE GAME</h1>
      </main>
    );
  }
  return <TownApp />;
}

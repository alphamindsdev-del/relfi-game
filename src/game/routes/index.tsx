import { createFileRoute } from "@tanstack/react-router";
import { RelFiGame } from "@/game/state/RelFiGame";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <RelFiGame mode="standalone" containerMode="fullscreen" />;
}

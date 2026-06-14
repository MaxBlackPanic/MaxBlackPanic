import type { Metadata } from "next";
import EchoesGame from "./EchoesGame";

export const metadata: Metadata = {
  title: "Ascendant Echoes — match-3 ascension (web demo)",
  description:
    "Play the browser demo of Ascendant Echoes: climb the Tower of Ascension by matching elemental orbs into ever-bigger combos. A web port of the SwiftUI + SpriteKit iOS game.",
};

export default function EchoesPage() {
  return <EchoesGame />;
}

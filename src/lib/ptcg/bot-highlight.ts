import type { FaceCard, GameView, SideView } from "./view.ts";

export type HighlightZone = "active" | "bench" | "hand" | "trash" | "prizes" | "deck" | "stadium";

export interface BoardHighlight {
  side: "you" | "opp" | "table";
  zone: HighlightZone;
  index?: number;
}

function faceKey(card: FaceCard | null | undefined): string {
  if (!card) return "";
  if (card.hidden) return "hidden";
  return [
    card.name,
    card.hp ?? "",
    card.maxHp ?? "",
    (card.energies || []).join(","),
    card.image || "",
  ].join("|");
}

function sideHighlights(side: "you" | "opp", prev: SideView | null | undefined, next: SideView): BoardHighlight[] {
  const out: BoardHighlight[] = [];
  if (!prev) {
    out.push({ side, zone: "active" }, { side, zone: "bench" }, { side, zone: "hand" }, { side, zone: "trash" });
    return out;
  }
  const prevActive = prev.active.map(faceKey).join(";");
  const nextActive = next.active.map(faceKey).join(";");
  if (prevActive !== nextActive) out.push({ side, zone: "active" });

  const maxBench = Math.max(prev.bench.length, next.bench.length, 5);
  for (let index = 0; index < maxBench; index += 1) {
    if (faceKey(prev.bench[index]) !== faceKey(next.bench[index])) {
      out.push({ side, zone: "bench", index });
    }
  }

  if (prev.handCount !== next.handCount) out.push({ side, zone: "hand" });
  if (prev.discard.map(faceKey).join(";") !== next.discard.map(faceKey).join(";")) out.push({ side, zone: "trash" });
  if (prev.prizeCount !== next.prizeCount) out.push({ side, zone: "prizes" });
  if (prev.deckCount !== next.deckCount) out.push({ side, zone: "deck" });
  return out;
}

export function boardHighlights(prev: GameView | null | undefined, next: GameView): BoardHighlight[] {
  const out: BoardHighlight[] = [];
  out.push(...sideHighlights("opp", prev?.opp, next.opp));
  out.push(...sideHighlights("you", prev?.you, next.you));
  if (faceKey(prev?.stadium) !== faceKey(next.stadium)) {
    out.push({ side: "table", zone: "stadium" });
  }
  return out;
}

export function highlightClass(highlights: BoardHighlight[], side: "you" | "opp" | "table", zone: HighlightZone, index?: number): string {
  const hit = highlights.some((row) => {
    if (row.side !== side || row.zone !== zone) return false;
    if (zone === "bench" && row.index != null) return row.index === index;
    return true;
  });
  return hit ? " ptcg-flash" : "";
}

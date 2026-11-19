import raw from "./decks.json" with { type: "json" };
import type { DeckFile } from "./types.ts";

export const decks = raw as DeckFile[];

export function findDeck(id: string): DeckFile | undefined {
  return decks.find((deck) => deck.id === id);
}

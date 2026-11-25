import assert from "node:assert/strict";
import test from "node:test";
import type { BotDifficulty } from "./difficulty.ts";
import { decks } from "./decks.ts";
import { loadCatalogs, loadEngine } from "./engine.ts";
import { playBotGame } from "./play.ts";
import type { Catalogs, PtcgModule } from "./types.ts";

test("one bot versus bot game finishes through the wasm engine", async () => {
  const engine = await loadEngine(new URL("../../../public/game/ptcg.mjs", import.meta.url));
  const catalogs = loadCatalogs(engine);
  const sample = decks.find((deck) => deck.id === "sample");
  assert.ok(sample);
  const game = playBotGame(engine, sample.cards, sample.cards, catalogs);
  assert.equal(game.ok, true, JSON.stringify(game));
  assert.equal(game.steps > 0, true);
  assert.equal(game.attacks > 0, true);
  assert.equal(game.result === 0 || game.result === 1 || game.result === 2, true);
});

function matchWins(
  engine: PtcgModule,
  catalogs: Catalogs,
  deckLeft: number[],
  deckRight: number[],
  left: BotDifficulty,
  right: BotDifficulty,
  games: number,
): { left: number; right: number; draw: number; failed: number } {
  const tally = { left: 0, right: 0, draw: 0, failed: 0 };
  for (let i = 0; i < games; i += 1) {
    // Alternate seats so deck order / first-player bias cancels out.
    const swap = i % 2 === 1;
    const game = swap
      ? playBotGame(engine, deckRight, deckLeft, catalogs, 5000, right, left)
      : playBotGame(engine, deckLeft, deckRight, catalogs, 5000, left, right);
    if (!game.ok) {
      tally.failed += 1;
      continue;
    }
    if (game.result === 2) tally.draw += 1;
    else if (game.result === 0) {
      if (swap) tally.right += 1;
      else tally.left += 1;
    } else if (game.result === 1) {
      if (swap) tally.left += 1;
      else tally.right += 1;
    }
  }
  return tally;
}

test("normal bot beats easy bot over 100 games", async () => {
  const engine = await loadEngine(new URL("../../../public/game/ptcg.mjs", import.meta.url));
  const catalogs = loadCatalogs(engine);
  const leftDeck = decks.find((deck) => deck.id === "crustle");
  const rightDeck = decks.find((deck) => deck.id === "dragapult");
  assert.ok(leftDeck && rightDeck);
  const tally = matchWins(engine, catalogs, leftDeck.cards, rightDeck.cards, "normal", "easy", 100);
  assert.equal(tally.failed, 0, JSON.stringify(tally));
  assert.ok(tally.left > tally.right, JSON.stringify(tally));
});

test("hard bot beats normal bot over 100 games", async () => {
  const engine = await loadEngine(new URL("../../../public/game/ptcg.mjs", import.meta.url));
  const catalogs = loadCatalogs(engine);
  const leftDeck = decks.find((deck) => deck.id === "crustle");
  const rightDeck = decks.find((deck) => deck.id === "dragapult");
  assert.ok(leftDeck && rightDeck);
  const tally = matchWins(engine, catalogs, leftDeck.cards, rightDeck.cards, "hard", "normal", 100);
  assert.equal(tally.failed, 0, JSON.stringify(tally));
  assert.ok(tally.left > tally.right, JSON.stringify(tally));
});

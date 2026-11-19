import assert from "node:assert/strict";
import test from "node:test";
import { decks } from "./decks.ts";
import { loadCatalogs, loadEngine } from "./engine.ts";
import { playBotGame } from "./play.ts";

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

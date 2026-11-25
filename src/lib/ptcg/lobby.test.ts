import assert from "node:assert/strict";
import test from "node:test";
import {
  RANDOM_DECK,
  defaultPrefs,
  isDifficulty,
  loadPrefs,
  lobbyHtml,
  resolveOpponentDeck,
  savePrefs,
  deckCardInfo,
  allDeckCards,
} from "./lobby.ts";
import { decks } from "./decks.ts";

test("lobby prefs round-trip through storage", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  savePrefs({ mine: "dragapult", theirs: RANDOM_DECK, difficulty: "hard" }, storage);
  assert.deepEqual(loadPrefs(storage), {
    mine: "dragapult",
    theirs: RANDOM_DECK,
    difficulty: "hard",
  });
  assert.equal(isDifficulty("normal"), true);
  assert.equal(isDifficulty("medium"), false);
});

test("invalid stored prefs fall back to defaults", () => {
  const storage = {
    getItem() {
      return '{"mine":"nope","theirs":1,"difficulty":"insane"}';
    },
    setItem() {},
  };
  assert.deepEqual(loadPrefs(storage), defaultPrefs());
});

test("random opponent picks a real deck id", () => {
  const ids = new Set(decks.map((deck) => deck.id));
  for (let i = 0; i < 20; i += 1) {
    const picked = resolveOpponentDeck(RANDOM_DECK, "sample", () => i / 20);
    assert.equal(ids.has(picked), true, picked);
  }
  assert.equal(resolveOpponentDeck("crustle", "sample"), "crustle");
});

test("lobby cards show face art, type, and blurb without a middle dot", () => {
  const cards = allDeckCards();
  assert.equal(cards.length, decks.length);
  for (const card of cards) {
    assert.ok(card.image, card.id);
    assert.ok(card.typeKo, card.id);
    assert.ok(card.blurbKo, card.id);
    assert.equal(card.blurbKo.includes("\u00b7"), false);
  }
  const sample = deckCardInfo(decks[0]!);
  assert.equal(sample.faceKo, "가이오가");
  assert.equal(sample.typeKo, "물");
  const html = lobbyHtml(defaultPrefs());
  assert.match(html, /data-deck="mine"/);
  assert.match(html, /data-id="random"/);
  assert.match(html, /data-difficulty="easy"/);
  assert.match(html, /봇 난이도/);
  assert.match(html, /가이오가/);
  assert.match(html, /물/);
  assert.equal(html.includes("\u00b7"), false);
});

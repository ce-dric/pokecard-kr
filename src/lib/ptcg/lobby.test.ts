import assert from "node:assert/strict";
import test from "node:test";
import { BOT_DIFFICULTY_STORAGE_KEY } from "./difficulty.ts";
import {
  RANDOM_DECK,
  defaultPrefs,
  loadPrefs,
  lobbyHtml,
  resolveOpponentDeck,
  savePrefs,
  deckCardInfo,
  allDeckCards,
} from "./lobby.ts";
import { decks } from "./decks.ts";

function memoryStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    raw: store,
  };
}

test("lobby prefs round-trip through storage using shared difficulty key", () => {
  const storage = memoryStorage();
  savePrefs({ mine: "dragapult", theirs: RANDOM_DECK, difficulty: "hard" }, storage);
  assert.deepEqual(loadPrefs(storage), {
    mine: "dragapult",
    theirs: RANDOM_DECK,
    difficulty: "hard",
  });
  assert.equal(storage.raw.get(BOT_DIFFICULTY_STORAGE_KEY), "hard");
  assert.equal(JSON.parse(storage.raw.get("ptcg.lobby") || "{}").difficulty, undefined);
});

test("invalid stored prefs fall back to defaults and shared difficulty", () => {
  const storage = memoryStorage({
    "ptcg.lobby": '{"mine":"nope","theirs":1}',
    [BOT_DIFFICULTY_STORAGE_KEY]: "normal",
  });
  assert.deepEqual(loadPrefs(storage), {
    ...defaultPrefs(storage),
    difficulty: "normal",
  });
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
  const html = lobbyHtml(defaultPrefs(null));
  assert.match(html, /data-deck="mine"/);
  assert.match(html, /data-id="random"/);
  assert.match(html, /data-difficulty="normal"/);
  assert.match(html, /봇 난이도/);
  assert.match(html, /가이오가/);
  assert.match(html, /물/);
  assert.equal(html.includes("\u00b7"), false);
});

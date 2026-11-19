import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { decks } from "./decks.ts";
import mappingFile from "../../data/game-cards.json" with { type: "json" };
import type { CardMapping } from "./types.ts";
import { cardFace, cleanText, optionLabel } from "./view.ts";
import type { Observation } from "./types.ts";

const mapping = mappingFile as CardMapping;
const middleDot = "\u00b7";
const root = new URL("../../../", import.meta.url);

test("game text does not use a middle dot", () => {
  const files = [
    "src/components/Header.astro",
    "src/pages/game/index.astro",
    "src/pages/game/game.css",
    "src/data/game-cards.json",
    "src/lib/ptcg/decks.json",
  ];
  const dir = new URL("./", import.meta.url);
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".ts") || name.endsWith(".json")) files.push(`src/lib/ptcg/${name}`);
  }
  for (const file of files) {
    const text = readFileSync(new URL(file, root), "utf8");
    assert.equal(text.includes(middleDot), false, file);
  }
});

test("decks are 60 cards and every deck card is in the mapping", () => {
  assert.equal(decks.length >= 2 && decks.length <= 3, true);
  const sample = decks.find((deck) => deck.id === "sample");
  assert.ok(sample);
  assert.equal(sample.cards.filter((id) => id === 721).length, 2);
  assert.equal(sample.cards.filter((id) => id === 722).length, 4);
  assert.equal(sample.cards.filter((id) => id === 723).length, 4);
  assert.ok(sample.cards.includes(3));
  const ids = new Set<number>();
  for (const deck of decks) {
    assert.equal(deck.cards.length, 60, deck.id);
    assert.equal(deck.titleKo.includes(middleDot), false);
    for (const id of deck.cards) {
      ids.add(id);
      assert.ok(mapping.cards[String(id)], `missing card ${id}`);
    }
  }
  for (const id of Object.keys(mapping.cards)) {
    const row = mapping.cards[id];
    assert.equal(row.id, Number(id));
    if (!ids.has(row.id)) assert.ok(row.link, "cards outside the decks must be matches");
  }
});

test("Korean names come only from our verified card data", () => {
  const setsDir = new URL("../../data/sets/", import.meta.url);
  const verified = new Map<string, string>();
  for (const name of readdirSync(setsDir)) {
    if (!name.endsWith(".json")) continue;
    const set = JSON.parse(readFileSync(new URL(name, setsDir), "utf8")) as {
      id: string;
      cards: { number: string; nameKo: string | null; nameStatus: string; halfKo: string | null }[];
    };
    for (const card of set.cards) {
      if (card.nameStatus === "verified-kr" && card.nameKo) {
        const shown = card.halfKo ? `${card.nameKo} ${card.halfKo}` : card.nameKo;
        verified.set(`${set.id}:${card.number}`, shown);
      }
    }
  }
  for (const row of Object.values(mapping.cards)) {
    if (!row.link?.nameKo) {
      assert.equal(row.link?.nameKo ?? null, null);
      continue;
    }
    const expected = verified.get(`${row.link.setId}:${row.link.number}`);
    assert.equal(row.link.nameKo, expected, `${row.id} ${row.link.nameKo}`);
    assert.equal(row.link.nameKo.includes(middleDot), false);
  }
});

test("matched cards keep our name and unmatched cards keep the engine English name", () => {
  const cards = new Map([
    [8, { cardId: 8, name: "Eevee", cardType: 0, hp: 70, energyType: 0, basic: true, ex: false, megaEx: false, weakness: null, resistance: null }],
    [721, { cardId: 721, name: "Kyogre", cardType: 0, hp: 150, energyType: 3, basic: true, ex: false, megaEx: false, weakness: 4, resistance: null }],
  ]);
  const matched = cardFace(8, cards, {
    source: mapping.source,
    cards: { "8": { id: 8, setCode: "MEE", number: "008/019", nameJa: null, link: { setId: "mee", slug: "mega-starter-eevee", number: "008", nameKo: "이브이", image: "images/cards/mee/008-thumb.webp" } } },
  });
  assert.equal(matched.name, "이브이");
  assert.equal(matched.nameKo, "이브이");
  assert.equal(matched.image, "images/cards/mee/008-thumb.webp");

  const kyogre = mapping.cards["721"];
  assert.equal(kyogre?.link, null);
  const face = cardFace(721, cards, mapping);
  assert.equal(face.name, "Kyogre");
  assert.equal(face.nameKo, null);
  assert.equal(face.image, null);
  assert.equal(cleanText("a\u00b7b"), "a b");
});

test("attach and evolve labels name the pokemon they land on", () => {
  const cards = new Map([
    [3, { cardId: 3, name: "Water Energy", cardType: 5, hp: 0, energyType: 3, basic: false, ex: false, megaEx: false, weakness: null, resistance: null }],
    [721, { cardId: 721, name: "Kyogre", cardType: 0, hp: 150, energyType: 3, basic: true, ex: false, megaEx: false, weakness: null, resistance: null }],
    [722, { cardId: 722, name: "Snover", cardType: 0, hp: 90, energyType: 3, basic: true, ex: false, megaEx: false, weakness: null, resistance: null }],
    [723, { cardId: 723, name: "Mega Abomasnow ex", cardType: 0, hp: 350, energyType: 3, basic: false, ex: true, megaEx: true, weakness: null, resistance: null }],
  ]);
  const player = {
    active: [{ id: 722, serial: 1, hp: 90, maxHp: 90, energies: [] }],
    bench: [{ id: 721, serial: 2, hp: 150, maxHp: 150, energies: [] }],
    benchMax: 5,
    deckCount: 40,
    discard: [],
    prize: [],
    handCount: 2,
    hand: [{ id: 3, serial: 3 }, { id: 723, serial: 4 }],
    poisoned: false,
    burned: false,
    asleep: false,
    paralyzed: false,
    confused: false,
  };
  const obs: Observation = {
    select: null,
    logs: [],
    current: {
      turn: 2,
      yourIndex: 0,
      result: -1,
      energyAttached: false,
      stadium: [],
      players: [player, { ...player, hand: null, active: [], bench: [] }],
    },
  };
  const active = optionLabel(obs, { type: 8, area: 2, index: 0, inPlayArea: 4, inPlayIndex: 0 }, cards, new Map(), mapping);
  const bench = optionLabel(obs, { type: 8, area: 2, index: 0, inPlayArea: 5, inPlayIndex: 0 }, cards, new Map(), mapping);
  assert.equal(active, "배틀 Snover에 부착 Water Energy");
  assert.equal(bench, "벤치 1 Kyogre에 부착 Water Energy");
  assert.notEqual(active, bench);
  const evolve = optionLabel(obs, { type: 9, area: 2, index: 1, inPlayArea: 4, inPlayIndex: 0 }, cards, new Map(), mapping);
  assert.equal(evolve, "배틀 Snover에 진화 Mega Abomasnow ex");
});

test("the battle page credits the engine and the nav links to it", () => {
  const page = readFileSync(new URL("src/pages/game/index.astro", root), "utf8");
  const header = readFileSync(new URL("src/components/Header.astro", root), "utf8");
  assert.match(page, /PTCG AI Battle Challenge/);
  assert.match(page, /비공식 팬 페이지/);
  assert.match(page, /포켓몬 공식 사이트가 아닙니다/);
  assert.match(header, /대전/);
  assert.match(header, /game\//);
});

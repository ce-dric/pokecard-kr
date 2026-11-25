import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { decks } from "./decks.ts";
import mappingFile from "../../data/game-cards.json" with { type: "json" };
import type { CardMapping, Observation } from "./types.ts";
import { buildView, cardFace, cleanText } from "./view.ts";

const mapping = mappingFile as CardMapping;
const middleDot = "\u00b7";
const root = new URL("../../../", import.meta.url);
const BASIC_ENERGY = new Set(["GRA", "FIR", "WAT", "LIG", "PSY", "FIG", "DAR", "MET"]);
const STANDARD = new Set(["H", "I", "J"]);

function setCards() {
  const setsDir = new URL("../../data/sets/", import.meta.url);
  const sets = new Map<
    string,
    {
      id: string;
      regulation: string;
      cards: {
        number: string;
        nameKo: string | null;
        nameStatus: string;
        halfKo: string | null;
        regulation?: string | null;
        category?: string;
      }[];
    }
  >();
  for (const name of readdirSync(setsDir)) {
    if (!name.endsWith(".json")) continue;
    const set = JSON.parse(readFileSync(new URL(name, setsDir), "utf8"));
    sets.set(set.id, set);
  }
  return sets;
}

function setMarksOnlyStandard(regulation: string) {
  const marks = String(regulation || "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return marks.length > 0 && marks.every((mark) => STANDARD.has(mark));
}

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
    assert.equal(deck.faceEn.includes(middleDot), false);
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
  const sets = setCards();
  const verified = new Map<string, string>();
  for (const set of sets.values()) {
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

test("matched cards keep our Korean name and image", () => {
  const cards = new Map([
    [8, { cardId: 8, name: "Eevee", cardType: 0, hp: 70, energyType: 0, basic: true, ex: false, megaEx: false, weakness: null, resistance: null }],
    [721, { cardId: 721, name: "Kyogre", cardType: 0, hp: 150, energyType: 3, basic: true, ex: false, megaEx: false, weakness: 4, resistance: null }],
  ]);
  const matched = cardFace(8, cards, {
    source: mapping.source,
    cards: {
      "8": {
        id: 8,
        setCode: "MEE",
        number: "008/019",
        nameJa: null,
        link: { setId: "mee", slug: "mega-starter-eevee", number: "008", nameKo: "이브이", image: "images/cards/mee/008-thumb.webp" },
        picture: null,
      },
    },
  });
  assert.equal(matched.name, "이브이");
  assert.equal(matched.nameKo, "이브이");
  assert.equal(matched.image, "images/cards/mee/008-thumb.webp");
  assert.equal(matched.fullImage, "images/cards/mee/008.webp");

  const kyogre = mapping.cards["721"];
  assert.equal(kyogre?.link?.nameKo, "가이오가");
  assert.equal(kyogre?.link?.image, "images/cards/m1s/016-thumb.webp");
  const face = cardFace(721, cards, mapping);
  assert.equal(face.name, "가이오가");
  assert.equal(face.nameKo, "가이오가");
  assert.equal(face.image, "images/cards/m1s/016-thumb.webp");
  assert.equal(face.fullImage, "images/cards/m1s/016.webp");

  const water = cardFace(3, new Map(), mapping);
  assert.equal(water.name, "기본 물 에너지");
  assert.equal(water.nameKo, "기본 물 에너지");
  assert.equal(water.image, "images/cards/m6a/WAT-thumb.webp");
  assert.equal(water.fullImage, "images/cards/m6a/WAT.webp");
  assert.equal(cleanText("a\u00b7b"), "a b");
});

test("mapping links cover published Korean sets and keep energy anchors", () => {
  assert.ok(Object.keys(mapping.source.matches).length >= 20);
  assert.equal(mapping.source.linked.m1s > 0, true);
  assert.equal(mapping.source.linked.mc > 0, true);
  assert.equal(mapping.source.linked.m2a > 0, true);
  const linked: Record<string, number> = Object.fromEntries(
    Object.keys(mapping.source.linked).map((id) => [id, 0]),
  );
  for (const row of Object.values(mapping.cards)) {
    if (!row.link) continue;
    assert.ok(row.link.setId in linked, row.link.setId);
    linked[row.link.setId] += 1;
    assert.equal(row.picture, null);
  }
  assert.deepEqual(linked, mapping.source.linked);
  assert.equal(mapping.cards["1"]?.link?.setId, "mem");
  assert.equal(mapping.cards["4"]?.link?.setId, "mee");
  assert.equal(mapping.cards["7"]?.link?.setId, "mez");
  assert.equal(mapping.cards["8"]?.link?.nameKo, "기본 강철 에너지");
});

test("every deck card uses a Korean image and is Standard-legal", () => {
  const sets = setCards();
  const deckIds = new Set(decks.flatMap((deck) => deck.cards));
  let ours = 0;
  let jp = 0;
  let text = 0;
  for (const row of Object.values(mapping.cards)) {
    const face = cardFace(row.id, new Map(), mapping);
    if (row.link?.image) {
      ours += 1;
      assert.equal(face.image, row.link.image);
      assert.equal(face.nameKo, row.link.nameKo);
      const file = new URL(`../../../public/${row.link.image}`, import.meta.url);
      assert.equal(statSync(file).size > 1000, true, row.link.image);
    } else if (row.picture) {
      jp += 1;
      assert.equal(face.nameKo, null);
      assert.equal(face.image, `game/cards/${row.id}-thumb.webp`);
      assert.match(row.picture.page, /^https:\/\/www\.pokemon-card\.com\/card-search\/details\.php\/card\/\d+\/regu\/all$/);
    } else {
      text += 1;
      assert.equal(face.image, null);
    }
    if (deckIds.has(row.id)) {
      assert.ok(row.link?.nameKo, `deck card ${row.id} missing Korean name`);
      assert.ok(face.image, `deck card ${row.id} has no image`);
      const set = sets.get(row.link.setId);
      assert.ok(set, row.link.setId);
      const card = set.cards.find((item) => item.number === row.link.number);
      assert.ok(card, `${row.link.setId}:${row.link.number}`);
      const basic = !row.setCode && BASIC_ENERGY.has(row.number);
      const mark = card.regulation == null ? "" : String(card.regulation);
      const ok =
        basic ||
        STANDARD.has(mark) ||
        ((mark === "" || mark == null) && setMarksOnlyStandard(set.regulation));
      assert.equal(ok, true, `deck card ${row.id} mark ${mark || set.regulation}`);
    }
  }
  assert.equal(text, 0);
  assert.equal(ours > 0, true);
  assert.equal(jp, 0);
  assert.deepEqual(
    decks.map((deck) => deck.id),
    ["sample", "crustle", "dragapult"],
  );
  assert.deepEqual(
    decks.map((deck) => deck.faceEn),
    ["가이오가", "암팰리스", "드래펄트 ex"],
  );
});

test("discard, stadium, and choices carry thumbnails", () => {
  const empty = {
    active: [],
    bench: [],
    benchMax: 5,
    deckCount: 40,
    discard: [],
    prize: [],
    handCount: 0,
    hand: [],
    poisoned: false,
    burned: false,
    asleep: false,
    paralyzed: false,
    confused: false,
  };
  const obs = {
    select: {
      type: 0,
      context: 7,
      minCount: 1,
      maxCount: 1,
      option: [
        { type: 3, area: 2, index: 0, playerIndex: 0 },
        { type: 3, area: 12, index: 0, playerIndex: 0 },
        { type: 3, area: 3, index: 0, playerIndex: 0 },
        { type: 3, area: 3, index: 1, playerIndex: 1 },
        { type: 10, area: 7, index: 0 },
      ],
    },
    logs: [],
    current: {
      turn: 2,
      yourIndex: 0,
      result: -1,
      energyAttached: false,
      stadium: [{ id: 1264, serial: 3 }],
      looking: [{ id: 1121, serial: 8 }],
      players: [
        { ...empty, handCount: 1, hand: [{ id: 721, serial: 1 }], discard: [{ id: 1121, serial: 2 }] },
        { ...empty, hand: null, handCount: 5, discard: [{ id: 756, serial: 9 }, { id: 723, serial: 4 }] },
      ],
    },
  } as Observation;
  const view = buildView(obs, 0, [], { cards: new Map(), attacks: new Map() }, mapping, undefined);
  assert.equal(view.you.discard[0]?.image, "images/cards/m2a/217-thumb.webp");
  assert.equal(view.opp.discard[1]?.image, "images/cards/m1s/018-thumb.webp");
  assert.equal(view.options[0]?.image, "images/cards/m1s/016-thumb.webp");
  assert.equal(view.options[0]?.fullImage, "images/cards/m1s/016.webp");
  assert.equal(view.options[1]?.image, "images/cards/m2a/217-thumb.webp");
  assert.equal(view.options[2]?.image, "images/cards/m2a/217-thumb.webp");
  assert.equal(view.options[2]?.fullImage, "images/cards/m2a/217.webp");
  assert.equal(view.options[3]?.image, "images/cards/m1s/018-thumb.webp");
  assert.equal(view.options[4]?.image, "images/cards/m2/079-thumb.webp");
  assert.equal(view.options[4]?.label, "특성");
  assert.equal(view.stadium?.image, "images/cards/m2/079-thumb.webp");
  const page = readFileSync(new URL("src/lib/ptcg/ui.ts", root), "utf8");
  assert.match(page, /loading="lazy"/);
  assert.match(page, /data-zoom-open/);
  assert.match(page, /트래시/);
  assert.match(page, /확대/);
  assert.match(page, /이미지 출처: 포켓몬 공식/);
  assert.match(page, /스탠다드 레귤레이션/);
  assert.match(page, /pokemoncard\.co\.kr\/card\/play_qna/);
});

test("the battle page credits the engine and the nav links to it", () => {
  const page = readFileSync(new URL("src/pages/game/index.astro", root), "utf8");
  const header = readFileSync(new URL("src/components/Header.astro", root), "utf8");
  assert.match(page, /PTCG AI Battle Challenge/);
  assert.match(page, /비공식 팬 페이지/);
  assert.match(page, /포켓몬 공식 사이트가 아닙니다/);
  assert.match(page, /공식 스탠다드/);
  assert.match(header, /대전/);
  assert.match(header, /game\//);
});

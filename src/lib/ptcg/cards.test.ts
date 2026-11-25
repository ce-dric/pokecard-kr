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

test("game text does not use a middle dot", () => {
  const files = [
    "src/components/Header.astro",
    "src/pages/game/index.astro",
    "src/pages/game/game.css",
    "src/pages/game/rules/index.astro",
    "src/pages/game/rules/rules.css",
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
  assert.equal(kyogre?.link, null);
  const face = cardFace(721, cards, mapping);
  assert.equal(face.name, "Kyogre");
  assert.equal(face.nameKo, null);
  assert.equal(face.image, "game/cards/721-thumb.webp");
  assert.equal(face.fullImage, "game/cards/721.webp");

  const water = cardFace(3, new Map(), mapping);
  assert.equal(water.name, "기본 물 에너지");
  assert.equal(water.nameKo, "기본 물 에너지");
  assert.equal(water.image, "images/cards/m6a/WAT-thumb.webp");
  assert.equal(water.fullImage, "images/cards/m6a/WAT.webp");
  assert.equal(cleanText("a\u00b7b"), "a b");
});

test("published set matches come from the engine set code and number", () => {
  assert.deepEqual(mapping.source.matches, { m6: 0, m6a: 8, mee: 1, mem: 1, mez: 1 });
  assert.deepEqual(mapping.source.linked, { m6: 0, m6a: 5, mee: 1, mem: 1, mez: 1 });
  const linked: Record<string, number> = { m6: 0, m6a: 0, mee: 0, mem: 0, mez: 0 };
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

test("every deck card has a small image and unmatched cards keep the official fallback", () => {
  const deckIds = new Set(decks.flatMap((deck) => deck.cards));
  let jp = 0;
  let ours = 0;
  let text = 0;
  for (const row of Object.values(mapping.cards)) {
    const face = cardFace(row.id, new Map(), mapping);
    if (row.link?.image) {
      ours += 1;
      assert.equal(face.image, row.link.image);
      assert.equal(face.nameKo, row.link.nameKo);
    } else if (row.picture) {
      jp += 1;
      assert.equal(face.nameKo, null);
      assert.equal(face.image, `game/cards/${row.id}-thumb.webp`);
      assert.equal(face.fullImage, `game/cards/${row.id}.webp`);
      assert.match(row.picture.page, /^https:\/\/www\.pokemon-card\.com\/card-search\/details\.php\/card\/\d+\/regu\/all$/);
      for (const path of [row.picture.thumb, row.picture.full]) {
        const file = new URL(`../../../public/${path}`, import.meta.url);
        const info = statSync(file);
        const bytes = readFileSync(file);
        assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
        assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
        const limit = path.endsWith("-thumb.webp") ? 35000 : 80000;
        assert.equal(info.size < limit, true, `${path} is ${info.size} bytes`);
      }
    } else {
      text += 1;
      assert.equal(face.image, null);
    }
    if (deckIds.has(row.id)) assert.ok(face.image, `deck card ${row.id} has no image`);
  }
  assert.equal(text, 0);
  assert.equal(jp > ours, true);
  assert.deepEqual(
    decks.map((deck) => deck.id),
    ["sample", "crustle", "dragapult"],
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
  assert.equal(view.you.discard[0]?.image, "game/cards/1121-thumb.webp");
  assert.equal(view.opp.discard[1]?.image, "game/cards/723-thumb.webp");
  assert.equal(view.options[0]?.image, "game/cards/721-thumb.webp");
  assert.equal(view.options[0]?.fullImage, "game/cards/721.webp");
  assert.equal(view.options[1]?.image, "game/cards/1121-thumb.webp");
  assert.equal(view.options[2]?.image, "game/cards/1121-thumb.webp");
  assert.equal(view.options[2]?.fullImage, "game/cards/1121.webp");
  assert.equal(view.options[3]?.image, "game/cards/723-thumb.webp");
  assert.equal(view.options[4]?.image, "game/cards/1264-thumb.webp");
  assert.equal(view.options[4]?.label, "특성");
  assert.equal(view.stadium?.image, "game/cards/1264-thumb.webp");
  const page = readFileSync(new URL("src/lib/ptcg/ui.ts", root), "utf8");
  assert.match(page, /loading="lazy"/);
  assert.match(page, /data-zoom-open/);
  assert.match(page, /트래시/);
  assert.match(page, /확대/);
  assert.match(page, /이미지 출처: 포켓몬 공식/);
});

test("the battle page credits the engine and the nav links to it", () => {
  const page = readFileSync(new URL("src/pages/game/index.astro", root), "utf8");
  const header = readFileSync(new URL("src/components/Header.astro", root), "utf8");
  assert.match(page, /PTCG AI Battle Challenge/);
  assert.match(page, /비공식 팬 페이지/);
  assert.match(page, /포켓몬 공식 사이트가 아닙니다/);
  assert.match(page, /game\/rules\//);
  assert.match(page, /놀이방법/);
  assert.match(header, /대전/);
  assert.match(header, /game\//);
});

test("the how-to-play guide uses official terms and cites the official page", () => {
  const page = readFileSync(new URL("src/pages/game/rules/index.astro", root), "utf8");
  assert.match(page, /https:\/\/pokemoncard\.co\.kr\/card\/play/);
  assert.match(page, /트래쉬/);
  assert.match(page, /배틀필드/);
  assert.match(page, /이 사이트 대전과 다른 점/);
  assert.match(page, /트래시/);
  assert.match(page, /손패/);
  assert.equal(page.includes(middleDot), false);
});

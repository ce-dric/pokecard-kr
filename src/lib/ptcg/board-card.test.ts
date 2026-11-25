import assert from "node:assert/strict";
import test from "node:test";
import { playCardHtml, rotateClassForConditions } from "./board-card.ts";
import type { CardData, CardMapping, Observation, PokemonState } from "./types.ts";
import { buildView, type FaceCard } from "./view.ts";

const base: FaceCard = {
  name: "드래펄트 ex",
  nameKo: "드래펄트 ex",
  image: "game/cards/723-thumb.webp",
  fullImage: "game/cards/723.webp",
  hp: 250,
  maxHp: 350,
  energies: ["water", "water", "colorless"],
  kind: "포켓몬",
  typeLabel: "물",
  tools: ["럭키 헬멧"],
  conditions: [],
  ex: true,
  megaEx: false,
  prizeValue: 2,
};

test("in-play cards show remaining HP, damage, energy icons, tool, and prize mark", () => {
  const html = playCardHtml(base, { active: false });
  assert.equal(html.includes("\u00b7"), false);
  assert.match(html, /class="ptcg-card ptcg-card--play"/);
  assert.match(html, /data-hp-badge/);
  assert.match(html, />250</);
  assert.match(html, /data-damage/);
  assert.match(html, />100</);
  assert.match(html, /class="ptcg-energies"/);
  assert.match(html, /swatch-water/);
  assert.match(html, /swatch-colorless/);
  assert.match(html, /data-tool/);
  assert.match(html, /럭키 헬멧/);
  assert.match(html, /data-prize/);
  assert.match(html, /ex/);
  assert.match(html, /프라이즈 2/);
  assert.match(html, /data-zoom-open/);
  assert.doesNotMatch(html, /ptcg-card--tilt/);
});

test("active cards show special-condition badges and rotate for 잠듦 마비 혼란", () => {
  assert.equal(rotateClassForConditions(["독"]), "");
  assert.equal(rotateClassForConditions(["화상"]), "");
  assert.equal(rotateClassForConditions(["잠듦"]), "ptcg-card--tilt-sleep");
  assert.equal(rotateClassForConditions(["마비"]), "ptcg-card--tilt-paralyze");
  assert.equal(rotateClassForConditions(["혼란"]), "ptcg-card--tilt-confuse");
  assert.equal(rotateClassForConditions(["잠듦", "독"]), "ptcg-card--tilt-sleep");

  const html = playCardHtml(
    { ...base, conditions: ["잠듦", "독"], hp: 350, maxHp: 350, energies: [], tools: [] },
    { active: true },
  );
  assert.match(html, /ptcg-card--tilt-sleep/);
  assert.match(html, /class="ptcg-conditions"/);
  assert.match(html, /data-condition="잠듦"/);
  assert.match(html, /data-condition="독"/);
  assert.doesNotMatch(html, /data-damage/);
});

test("메가 ex marks prize value 3", () => {
  const html = playCardHtml(
    { ...base, name: "메가 가디안 ex", megaEx: true, prizeValue: 3, energies: [], tools: [], hp: 310, maxHp: 310 },
    { active: true },
  );
  assert.match(html, /메가 ex/);
  assert.match(html, /프라이즈 3/);
});

test("buildView maps tools, damage fields, and 잠듦 onto the active face", () => {
  const cards = new Map<number, CardData>([
    [10, { cardId: 10, name: "Dragapult ex", cardType: 0, hp: 350, energyType: 5, basic: false, ex: true, megaEx: false, weakness: null, resistance: null }],
    [20, { cardId: 20, name: "Lucky Helmet", cardType: 2, hp: 0, energyType: 0, basic: false, ex: false, megaEx: false, weakness: null, resistance: null }],
  ]);
  const mapping: CardMapping = {
    source: { repo: "t", commit: "c", csv: "c", matches: {}, linked: {} },
    cards: {
      "10": {
        id: 10,
        setCode: "x",
        number: "1",
        nameJa: null,
        link: { setId: "x", slug: "x", number: "1", nameKo: "드래펄트 ex", image: "game/cards/10-thumb.webp" },
        picture: null,
      },
      "20": {
        id: 20,
        setCode: "x",
        number: "2",
        nameJa: null,
        link: { setId: "x", slug: "x", number: "2", nameKo: "럭키 헬멧", image: null },
        picture: null,
      },
    },
  };
  const active: PokemonState = {
    id: 10,
    serial: 1,
    hp: 280,
    maxHp: 350,
    energies: [5, 0],
    tools: [{ id: 20, serial: 2 }],
  };
  const empty = {
    active: [] as (PokemonState | null)[],
    bench: [] as PokemonState[],
    benchMax: 5,
    deckCount: 40,
    discard: [],
    prize: [],
    handCount: 0,
    hand: [] as { id: number; serial: number }[] | null,
    poisoned: false,
    burned: false,
    asleep: true,
    paralyzed: false,
    confused: false,
  };
  const obs = {
    select: null,
    logs: [],
    current: {
      turn: 5,
      yourIndex: 0,
      result: -1,
      energyAttached: true,
      stadium: [],
      players: [
        { ...empty, active: [active], asleep: true },
        { ...empty, hand: null, handCount: 5 },
      ],
    },
  } as Observation;
  const view = buildView(obs, 0, [], { cards, attacks: new Map() }, mapping, undefined);
  const face = view.you.active[0];
  assert.equal(face.hp, 280);
  assert.equal(face.maxHp, 350);
  assert.deepEqual(face.energies, ["psychic", "colorless"]);
  assert.deepEqual(face.tools, ["럭키 헬멧"]);
  assert.deepEqual(face.conditions, ["잠듦"]);
  assert.equal(face.ex, true);
  assert.equal(face.prizeValue, 2);
  assert.deepEqual(view.you.conditions, ["잠듦"]);
});

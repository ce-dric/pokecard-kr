import assert from "node:assert/strict";
import test from "node:test";
import { attackValue, greedyChoice } from "./bot.ts";
import { botChoice } from "./bot-choice.ts";
import { energiesShort, withExtraEnergy } from "./bot-energy.ts";
import { normalChoice } from "./bot-normal.ts";
import {
  BOT_DIFFICULTY_STORAGE_KEY,
  parseBotDifficulty,
  readStoredBotDifficulty,
  writeStoredBotDifficulty,
} from "./difficulty.ts";
import type { Catalogs, Observation } from "./types.ts";

const cards = new Map([
  [
    1,
    {
      cardId: 1,
      name: "Basic",
      cardType: 0,
      hp: 60,
      energyType: 3,
      basic: true,
      ex: false,
      megaEx: false,
      weakness: null,
      resistance: null,
      attacks: [10, 11],
    },
  ],
  [
    2,
    {
      cardId: 2,
      name: "Mega",
      cardType: 0,
      hp: 300,
      energyType: 3,
      basic: false,
      ex: true,
      megaEx: true,
      weakness: null,
      resistance: null,
      attacks: [10],
    },
  ],
  [
    3,
    {
      cardId: 3,
      name: "Basic Water Energy",
      cardType: 5,
      hp: 0,
      energyType: 3,
      basic: false,
      ex: false,
      megaEx: false,
      weakness: null,
      resistance: null,
    },
  ],
  [
    4,
    {
      cardId: 4,
      name: "Bench Basic",
      cardType: 0,
      hp: 70,
      energyType: 3,
      basic: true,
      ex: false,
      megaEx: false,
      weakness: null,
      resistance: null,
      attacks: [10],
    },
  ],
  [
    5,
    {
      cardId: 5,
      name: "Draw Supporter",
      cardType: 3,
      hp: 0,
      energyType: 0,
      basic: false,
      ex: false,
      megaEx: false,
      weakness: null,
      resistance: null,
    },
  ],
]);

const attacks = new Map([
  [10, { attackId: 10, name: "Splash", damage: 60, energies: [3] }],
  [11, { attackId: 11, name: "Tickle", damage: 10, energies: [3] }],
]);

const catalogs: Catalogs = { cards, attacks };

function board(
  options: Observation["select"],
  defender: { id: number; hp: number },
  energyAttached = true,
  extras: {
    activeEnergies?: number[];
    bench?: Observation["current"]["players"][0]["bench"];
    hand?: Observation["current"]["players"][0]["hand"];
    deckCount?: number;
  } = {},
): Observation {
  return {
    select: options,
    logs: [],
    current: {
      turn: 3,
      yourIndex: 0,
      result: -1,
      energyAttached,
      stadium: [],
      players: [
        {
          active: [{ id: 1, serial: 1, hp: 60, maxHp: 60, energies: extras.activeEnergies ?? [3] }],
          bench: extras.bench ?? [],
          benchMax: 5,
          deckCount: extras.deckCount ?? 40,
          discard: [],
          prize: [],
          handCount: extras.hand?.length ?? 1,
          hand: extras.hand ?? [{ id: 3, serial: 2 }],
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        {
          active: [{ id: defender.id, serial: 3, hp: defender.hp, maxHp: defender.hp, energies: [] }],
          bench: [],
          benchMax: 5,
          deckCount: 40,
          discard: [],
          prize: [],
          handCount: 5,
          hand: null,
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
      ],
    },
  };
}

test("greedy bot prefers a KO attack over ending the turn", () => {
  const choice = greedyChoice(
    board({ type: 0, context: 0, minCount: 1, maxCount: 1, option: [{ type: 14 }, { type: 13, attackId: 10 }] }, { id: 1, hp: 60 }),
    catalogs,
  );
  assert.deepEqual(choice, [1]);
});

test("a KO on a Mega ex is worth more prizes than a KO on a basic", () => {
  const mega = attackValue(board(null, { id: 2, hp: 60 }), 10, cards, attacks);
  const basic = attackValue(board(null, { id: 1, hp: 60 }), 10, cards, attacks);
  assert.ok(mega > basic);
});

test("greedy bot attaches energy before a non-KO attack", () => {
  const choice = greedyChoice(
    board(
      {
        type: 0,
        context: 0,
        minCount: 1,
        maxCount: 1,
        option: [
          { type: 13, attackId: 11 },
          { type: 8, area: 2, index: 0, inPlayArea: 4, inPlayIndex: 0 },
        ],
      },
      { id: 1, hp: 200 },
      false,
    ),
    catalogs,
  );
  assert.deepEqual(choice, [1]);
});

test("energiesShort counts missing typed energy", () => {
  const poke = { id: 1, serial: 1, hp: 60, maxHp: 60, energies: [] as number[] };
  assert.equal(energiesShort(poke, attacks.get(10)), 1);
  assert.equal(energiesShort(withExtraEnergy(poke, 3), attacks.get(10)), 0);
});

test("normal bot attaches energy to the Pokemon closest to an attack", () => {
  const obs = board(
    {
      type: 0,
      context: 0,
      minCount: 1,
      maxCount: 1,
      option: [
        { type: 8, area: 2, index: 0, inPlayArea: 5, inPlayIndex: 0 },
        { type: 8, area: 2, index: 0, inPlayArea: 4, inPlayIndex: 0 },
        { type: 14 },
      ],
    },
    { id: 1, hp: 200 },
    false,
    {
      activeEnergies: [],
      bench: [{ id: 4, serial: 9, hp: 70, maxHp: 70, energies: [3, 3, 3] }],
      hand: [{ id: 3, serial: 2 }],
    },
  );
  assert.deepEqual(normalChoice(obs, catalogs), [1]);
});

test("normal bot avoids playing trainers when the deck is nearly empty", () => {
  const obs = board(
    {
      type: 0,
      context: 0,
      minCount: 1,
      maxCount: 1,
      option: [
        { type: 7, index: 0 },
        { type: 14 },
      ],
    },
    { id: 1, hp: 200 },
    true,
    {
      hand: [{ id: 5, serial: 8 }],
      deckCount: 2,
    },
  );
  assert.deepEqual(normalChoice(obs, catalogs), [1]);
});

test("botChoice dispatches easy and normal", () => {
  const obs = board(
    {
      type: 0,
      context: 0,
      minCount: 1,
      maxCount: 1,
      option: [
        { type: 8, area: 2, index: 0, inPlayArea: 5, inPlayIndex: 0 },
        { type: 8, area: 2, index: 0, inPlayArea: 4, inPlayIndex: 0 },
      ],
    },
    { id: 1, hp: 200 },
    false,
    {
      activeEnergies: [],
      bench: [{ id: 4, serial: 9, hp: 70, maxHp: 70, energies: [] }],
      hand: [{ id: 3, serial: 2 }],
    },
  );
  assert.deepEqual(botChoice(obs, catalogs, "normal"), [1]);
  assert.deepEqual(botChoice(obs, catalogs, "easy"), greedyChoice(obs, catalogs));
});

test("difficulty storage round-trips and rejects unknown values", () => {
  assert.equal(parseBotDifficulty("hard"), "hard");
  assert.equal(parseBotDifficulty("nope"), "normal");
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  writeStoredBotDifficulty(storage, "hard");
  assert.equal(store.get(BOT_DIFFICULTY_STORAGE_KEY), "hard");
  assert.equal(readStoredBotDifficulty(storage), "hard");
});

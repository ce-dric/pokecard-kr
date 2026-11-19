import assert from "node:assert/strict";
import test from "node:test";
import { attackValue, greedyChoice } from "./bot.ts";
import type { Catalogs, Observation } from "./types.ts";

const cards = new Map([
  [1, { cardId: 1, name: "Basic", cardType: 0, hp: 60, energyType: 3, basic: true, ex: false, megaEx: false, weakness: null, resistance: null }],
  [2, { cardId: 2, name: "Mega", cardType: 0, hp: 300, energyType: 3, basic: false, ex: true, megaEx: true, weakness: null, resistance: null }],
  [3, { cardId: 3, name: "Basic Water Energy", cardType: 5, hp: 0, energyType: 3, basic: false, ex: false, megaEx: false, weakness: null, resistance: null }],
]);

const attacks = new Map([
  [10, { attackId: 10, name: "Splash", damage: 60 }],
  [11, { attackId: 11, name: "Tickle", damage: 10 }],
]);

const catalogs: Catalogs = { cards, attacks };

function board(options: Observation["select"], defender: { id: number; hp: number }, energyAttached = true): Observation {
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
          active: [{ id: 1, serial: 1, hp: 60, maxHp: 60, energies: [3] }],
          bench: [],
          benchMax: 5,
          deckCount: 40,
          discard: [],
          prize: [],
          handCount: 1,
          hand: [{ id: 3, serial: 2 }],
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

import assert from "node:assert/strict";
import test from "node:test";
import { botActionCaption, collectBotTurnSteps, type BotStep } from "./bot-turn.ts";
import type { CardMapping, Catalogs, Observation } from "./types.ts";
import type { GameView } from "./view.ts";

const cards = new Map([
  [
    1,
    {
      cardId: 1,
      name: "Eevee",
      cardType: 0,
      hp: 60,
      energyType: 0,
      basic: true,
      ex: false,
      megaEx: false,
      weakness: null,
      resistance: null,
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
]);

const attacks = new Map([[10, { attackId: 10, name: "Splash", damage: 30 }]]);
const catalogs: Catalogs = { cards, attacks };
const mapping: CardMapping = {
  source: { repo: "", commit: "", csv: "", matches: {}, linked: {} },
  cards: {
    "1": {
      id: 1,
      setCode: "x",
      number: "1",
      nameJa: null,
      link: { setId: "x", slug: "eevee", number: "1", nameKo: "이브이", image: null },
      picture: null,
    },
    "3": {
      id: 3,
      setCode: "x",
      number: "2",
      nameJa: null,
      link: { setId: "x", slug: "water", number: "2", nameKo: "기본 물 에너지", image: null },
      picture: null,
    },
  },
};

function emptySide(hand: Observation["current"]["players"][0]["hand"]) {
  return {
    active: [{ id: 1, serial: 1, hp: 60, maxHp: 60, energies: [] as number[] }],
    bench: [],
    benchMax: 5,
    deckCount: 40,
    discard: [],
    prize: [],
    handCount: hand?.length ?? 0,
    hand,
    poisoned: false,
    burned: false,
    asleep: false,
    paralyzed: false,
    confused: false,
  };
}

function obsFor(select: Observation["select"], yourIndex = 1): Observation {
  return {
    select,
    logs: [],
    current: {
      turn: 2,
      yourIndex,
      result: -1,
      energyAttached: false,
      stadium: [],
      players: [emptySide([{ id: 3, serial: 2 }]), emptySide([{ id: 3, serial: 9 }])],
    },
  };
}

const stubView = { phase: "choose", prompt: "x", turn: 1 } as GameView;

test("botActionCaption describes attaching energy to a Pokemon", () => {
  const obs = obsFor({
    type: 0,
    context: 0,
    minCount: 1,
    maxCount: 1,
    option: [{ type: 8, area: 4, index: 0, inPlayArea: 4, inPlayIndex: 0 }],
  });
  const caption = botActionCaption(obs, [0], catalogs, mapping);
  assert.match(caption, /상대가/);
  assert.match(caption, /이브이/);
  assert.match(caption, /에너지/);
  assert.equal(caption.includes("\u00b7"), false);
});

test("botActionCaption describes an attack and ending the turn", () => {
  const attack = botActionCaption(
    obsFor({
      type: 0,
      context: 0,
      minCount: 1,
      maxCount: 1,
      option: [{ type: 13, attackId: 10 }],
    }),
    [0],
    catalogs,
    mapping,
  );
  assert.match(attack, /Splash|스플래시|공격/);
  assert.match(attack, /상대가/);

  const end = botActionCaption(
    obsFor({
      type: 0,
      context: 0,
      minCount: 1,
      maxCount: 1,
      option: [{ type: 14 }],
    }),
    [0],
    catalogs,
    mapping,
  );
  assert.match(end, /턴/);
});

test("collectBotTurnSteps emits a view after each bot action then stops on the human seat", () => {
  let seat = 1;
  let step = 0;
  const views: Observation[] = [
    obsFor(
      {
        type: 0,
        context: 0,
        minCount: 1,
        maxCount: 1,
        option: [{ type: 8, area: 4, index: 0, inPlayArea: 4, inPlayIndex: 0 }],
      },
      1,
    ),
    obsFor(
      {
        type: 0,
        context: 0,
        minCount: 1,
        maxCount: 1,
        option: [{ type: 14 }],
      },
      1,
    ),
    obsFor(null, 0),
  ];

  const result = collectBotTurnSteps({
    humanSeat: 0,
    getObservation: () => views[Math.min(step, views.length - 1)]!,
    choose: () => [0],
    applyChoice: () => {
      step += 1;
      seat = views[step]?.current.yourIndex ?? 0;
      return null;
    },
    buildView: (observation) => ({ ...stubView, turn: observation.current.turn, prompt: `seat-${observation.current.yourIndex}` }),
    caption: (_observation, _indices) => `caption-${step}`,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.steps.length, 2);
  assert.deepEqual(
    result.steps.map((row: BotStep) => row.caption),
    ["caption-0", "caption-1"],
  );
  assert.equal(result.steps[0]?.view.prompt, "seat-1");
  assert.equal(seat, 0);
});

test("collectBotTurnSteps returns an error when applyChoice fails", () => {
  const result = collectBotTurnSteps({
    humanSeat: 0,
    getObservation: () =>
      obsFor({
        type: 0,
        context: 0,
        minCount: 1,
        maxCount: 1,
        option: [{ type: 14 }],
      }),
    choose: () => [0],
    applyChoice: () => 7,
    buildView: () => stubView,
    caption: () => "x",
  });
  assert.equal(result.steps.length, 0);
  assert.equal(result.error, "봇이 고르지 못했습니다");
});

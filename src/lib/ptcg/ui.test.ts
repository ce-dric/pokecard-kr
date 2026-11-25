import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activeActions,
  findDropOption,
  handActions,
  interactionMode,
  mapOptions,
  playableSpots,
  targetsFor,
} from "./actions.ts";
import type { Observation } from "./types.ts";
import { actionFromKey, actionFromPointer, boardHtml } from "./ui.ts";
import type { FaceCard, GameView, SideView } from "./view.ts";

const card: FaceCard = {
  id: 721,
  name: "이브이",
  nameKo: "이브이",
  image: "game/cards/721-thumb.webp",
  fullImage: "game/cards/721.webp",
  hp: 70,
  maxHp: 70,
  energies: ["colorless"],
  kind: "포켓몬",
  typeLabel: "무색",
  tools: [],
  conditions: [],
  ex: false,
  megaEx: false,
  prizeValue: null,
};

function side(hand: FaceCard[] | null): SideView {
  return {
    active: [card],
    bench: [card],
    hand,
    handCount: hand ? hand.length : 5,
    prizeCount: 6,
    discard: [card],
    discardCount: 1,
    deckCount: 40,
    conditions: [],
  };
}

const view: GameView = {
  phase: "choose",
  prompt: "손으로 가져올 카드를 고르세요",
  context: 7,
  minCount: 1,
  maxCount: 1,
  options: [
    {
      index: 0,
      label: "패 이브이",
      image: card.image,
      fullImage: card.fullImage,
      kind: "select",
      source: { area: 2, index: 0, playerIndex: 0 },
      target: null,
    },
    {
      index: 1,
      label: "턴 종료",
      image: null,
      fullImage: null,
      kind: "end",
      source: null,
      target: null,
    },
  ],
  interaction: "picker",
  log: ["내 턴"],
  you: side([card]),
  opp: side(null),
  turn: 3,
  resultText: null,
  stadium: card,
};

interface Fake {
  tagName: string;
  attrs: Record<string, string>;
  parent: Fake | null;
  getAttribute(name: string): string | null;
  closest(selector: string): Fake | null;
}

function fake(tagName: string, attrs: Record<string, string>, parent: Fake | null = null): Fake {
  const node: Fake = {
    tagName,
    attrs,
    parent,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    closest(selector) {
      const self =
        (selector === "[data-zoom-open]" && "data-zoom-open" in attrs && tagName.toLowerCase() === "button") ||
        (selector === "[data-option]" && "data-option" in attrs && tagName.toLowerCase() === "button");
      if (self) return node;
      return parent ? parent.closest(selector) : null;
    },
  };
  return node;
}

function zones(html: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of html.matchAll(
    /<span class="ptcg-zone-label">([^<]+)<\/span>(?:(?!<span class="ptcg-zone-label">)[\s\S])*?<div class="ptcg-cards[^"]*">([\s\S]*?)<\/div>/g,
  )) {
    const list = found.get(match[1]) || [];
    list.push(match[2]);
    found.set(match[1], list);
  }
  return found;
}

function assertZoomThumb(fragment: string): void {
  const button = fragment.match(/<button\b[^>]*data-zoom-open[^>]*>[\s\S]*?<\/button>/);
  assert.ok(button, fragment);
  assert.match(button[0], /<img\b/);
  assert.match(button[0], /721\.webp/);
  assert.match(button[0], /aria-label="[^"]*확대"/);
  assert.doesNotMatch(button[0], /data-option=/);
}

test("bot turn board shows a banner and skip without action text or the log panel", () => {
  const html = boardHtml(view, "", {
    botTurn: true,
    highlights: [{ side: "opp", zone: "active" }],
  });
  assert.match(html, /class="ptcg-bot-banner"/);
  assert.match(html, /상대 턴/);
  assert.match(html, /data-skip-bot/);
  assert.match(html, /건너뛰기/);
  assert.match(html, /상대가 두는 중/);
  assert.match(html, /ptcg-zone--active ptcg-flash/);
  assert.doesNotMatch(html, /ptcg-log-panel/);
  assert.doesNotMatch(html, /상대가 이브이에 에너지를 붙였습니다/);
  assert.doesNotMatch(html, /data-option=/);
  assert.equal(html.includes("\u00b7"), false);
});

test("board card images are zoom controls in every zone", () => {
  const html = boardHtml(view);
  assert.equal(html.includes("\u00b7"), false);
  const found = zones(html);
  for (const label of ["스타디움", "배틀필드", "벤치"]) {
    const parts = found.get(label) || [];
    assert.equal(parts.length > 0, true, label);
    for (const part of parts) assertZoomThumb(part);
  }
  assert.match(html, /ptcg-pile--trash/);
  assert.match(html, /data-pile-open="pile-you-trash"/);
  assert.match(html, /data-pile-body="pile-you-trash"[\s\S]*data-zoom-open/);
  assert.match(html, /ptcg-hand--backs/);
  assert.match(html, /ptcg-zone--my-hand[\s\S]*data-zoom-open/);
});

test("battlefield and bench cards expose HP energy and status overlays", () => {
  const damaged: FaceCard = {
    ...card,
    name: "드래펄트 ex",
    hp: 250,
    maxHp: 350,
    energies: ["water", "water"],
    tools: ["럭키 헬멧"],
    conditions: ["마비"],
    ex: true,
    prizeValue: 2,
  };
  const html = boardHtml({
    ...view,
    you: { ...view.you, active: [damaged], bench: [damaged], conditions: ["마비"] },
  });
  assert.match(html, /ptcg-card--play/);
  assert.match(html, /data-hp-badge/);
  assert.match(html, /data-damage/);
  assert.match(html, /swatch-water/);
  assert.match(html, /data-tool/);
  assert.match(html, /data-prize/);
  assert.match(html, /data-condition="마비"/);
  assert.match(html, /ptcg-card--tilt-paralyze/);
});

test("a choice image enlarges without sitting inside the select button", () => {
  const html = boardHtml(view);
  const option = html.match(/<div class="ptcg-option">[\s\S]*?<\/div>/);
  assert.ok(option);
  const buttons = option[0].match(/<button\b[\s\S]*?<\/button>/g) || [];
  assert.equal(buttons.length, 3);
  assert.match(buttons[0], /class="ptcg-zoom-image"/);
  assert.match(buttons[0], /data-zoom-open/);
  assert.match(buttons[0], /<img\b/);
  assert.match(buttons[0], /721\.webp/);
  assert.match(buttons[1], /data-option="0"/);
  assert.match(buttons[1], /패 이브이/);
  assert.doesNotMatch(buttons[1], /<img/);
  assert.match(buttons[2], /class="ptcg-enlarge"/);
  assert.match(buttons[2], />확대</);
  assert.match(html, /data-option="1"[^>]*>턴 종료</);
  assert.doesNotMatch(html, /data-option="1"[^>]*data-zoom-open/);
});

test("tapping a choice image stops propagation and does not select", () => {
  const option = fake("button", { "data-option": "0" });
  const zoom = fake(
    "button",
    { "data-zoom-open": "", "data-full": "http://localhost/game/cards/721.webp", "data-alt": "패 이브이" },
    option,
  );
  const image = fake("img", {}, zoom);
  let stopped = false;
  const action = actionFromPointer({
    target: image,
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  assert.deepEqual(action, { type: "zoom", full: "http://localhost/game/cards/721.webp", alt: "패 이브이" });

  let textStopped = false;
  const text = actionFromPointer({
    target: fake("span", {}, option),
    stopPropagation() {
      textStopped = true;
    },
  });
  assert.equal(textStopped, false);
  assert.deepEqual(text, { type: "option", index: 0 });
});

test("Enter and Space on a focused card image enlarge it and Escape closes", () => {
  const zoom = fake("button", {
    "data-zoom-open": "",
    "data-full": "http://localhost/game/cards/721.webp",
    "data-alt": "이브이",
  });
  const image = fake("img", {}, zoom);
  for (const key of ["Enter", " "]) {
    let prevented = false;
    let stopped = false;
    const action = actionFromKey({
      key,
      target: image,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    });
    assert.equal(prevented, true, key);
    assert.equal(stopped, true, key);
    assert.deepEqual(action, { type: "zoom", full: "http://localhost/game/cards/721.webp", alt: "이브이" });
  }

  let escapePrevented = false;
  const closed = actionFromKey({
    key: "Escape",
    target: fake("button", { "data-zoom-close": "" }),
    preventDefault() {
      escapePrevented = true;
    },
    stopPropagation() {},
  });
  assert.deepEqual(closed, { type: "close" });
  assert.equal(escapePrevented, false);

  let selectPrevented = false;
  const select = actionFromKey({
    key: "Enter",
    target: fake("button", { "data-option": "0" }),
    preventDefault() {
      selectPrevented = true;
    },
    stopPropagation() {},
  });
  assert.equal(select, null);
  assert.equal(selectPrevented, false);
});

test("the battle page wires image keys and clicks to the enlarged view", () => {
  const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
  assert.match(source, /addEventListener\("click",[\s\S]*actionFromPointer/);
  assert.match(source, /addEventListener\("keydown",[\s\S]*actionFromKey/);
  assert.match(source, /key === "Escape"/);
  assert.match(source, /addEventListener\("contextmenu"/);
  assert.match(source, /addEventListener\("pointerdown"/);
  assert.match(source, /450/);
  assert.equal(source.includes("\u00b7"), false);
});

const mapCards = new Map([
  [1, { cardId: 1, name: "Basic", cardType: 0, hp: 60, energyType: 0, basic: true, ex: false, megaEx: false, weakness: null, resistance: null }],
  [2, { cardId: 2, name: "Stage", cardType: 0, hp: 120, energyType: 0, basic: false, ex: false, megaEx: false, weakness: null, resistance: null }],
  [3, { cardId: 3, name: "Energy", cardType: 5, hp: 0, energyType: 3, basic: false, ex: false, megaEx: false, weakness: null, resistance: null }],
  [4, { cardId: 4, name: "Item", cardType: 1, hp: 0, energyType: 0, basic: false, ex: false, megaEx: false, weakness: null, resistance: null }],
]);

function obsWith(options: Observation["select"]): Observation {
  return {
    select: options,
    logs: [],
    current: {
      turn: 2,
      yourIndex: 0,
      result: -1,
      energyAttached: false,
      stadium: [],
      players: [
        {
          active: [{ id: 1, serial: 1, hp: 60, maxHp: 60, energies: [3] }],
          bench: [{ id: 1, serial: 2, hp: 60, maxHp: 60, energies: [] }],
          benchMax: 5,
          deckCount: 40,
          discard: [],
          prize: [],
          handCount: 4,
          hand: [
            { id: 1, serial: 3 },
            { id: 3, serial: 4 },
            { id: 2, serial: 5 },
            { id: 4, serial: 6 },
          ],
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        {
          active: [{ id: 1, serial: 7, hp: 60, maxHp: 60, energies: [] }],
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

test("board mode marks playable cards and keeps the text option list as a fallback", () => {
  const boardView: GameView = {
    ...view,
    prompt: "할 일을 고르세요",
    interaction: "board",
    options: [
      {
        index: 0,
        label: "사용 이브이",
        image: card.image,
        fullImage: card.fullImage,
        kind: "play",
        source: { area: 2, index: 0, playerIndex: 0 },
        target: null,
        playAs: "bench",
      },
      {
        index: 1,
        label: "공격 Splash 60",
        image: null,
        fullImage: null,
        kind: "attack",
        source: { area: 4, index: 0, playerIndex: 0 },
        target: null,
        attackId: 10,
        damage: 60,
        energies: ["colorless"],
      },
      {
        index: 2,
        label: "턴 종료",
        image: null,
        fullImage: null,
        kind: "end",
        source: null,
        target: null,
      },
    ],
  };
  const html = boardHtml(boardView);
  assert.match(html, /data-spot="0:2:0"/);
  assert.match(html, /data-spot="0:4:0"/);
  assert.match(html, /is-playable/);
  assert.match(html, /data-card-act/);
  assert.match(html, /ptcg-card--play[^"]*is-playable|is-playable[^"]*ptcg-card--play/);
  assert.match(html, /텍스트로 고르기/);
  assert.match(html, /data-option="2"[^>]*>[\s\S]*턴 종료/);
  assert.equal(html.includes("\u00b7"), false);
});

test("option-to-card mapping covers play, attach, evolve, attack, retreat, and selection", () => {
  const mapped = mapOptions(
    obsWith({
      type: 0,
      context: 0,
      minCount: 1,
      maxCount: 1,
      option: [
        { type: 7, index: 0 },
        { type: 7, index: 3 },
        { type: 8, area: 2, index: 1, inPlayArea: 4, inPlayIndex: 0 },
        { type: 8, area: 2, index: 1, inPlayArea: 5, inPlayIndex: 0 },
        { type: 9, area: 2, index: 2, inPlayArea: 5, inPlayIndex: 0 },
        { type: 13, attackId: 10 },
        { type: 12 },
        { type: 14 },
      ],
    }),
    mapCards,
  );

  assert.equal(mapped[0]?.kind, "play");
  assert.equal(mapped[0]?.playAs, "bench");
  assert.deepEqual(mapped[0]?.source, { playerIndex: 0, area: 2, index: 0 });

  assert.equal(mapped[1]?.kind, "play");
  assert.equal(mapped[1]?.playAs, "use");

  assert.equal(mapped[2]?.kind, "attach");
  assert.deepEqual(mapped[2]?.source, { playerIndex: 0, area: 2, index: 1 });
  assert.deepEqual(mapped[2]?.target, { playerIndex: 0, area: 4, index: 0 });

  assert.equal(mapped[4]?.kind, "evolve");
  assert.deepEqual(mapped[4]?.target, { playerIndex: 0, area: 5, index: 0 });

  assert.equal(mapped[5]?.kind, "attack");
  assert.deepEqual(mapped[5]?.source, { playerIndex: 0, area: 4, index: 0 });
  assert.equal(mapped[5]?.attackId, 10);

  assert.equal(mapped[6]?.kind, "retreat");
  assert.deepEqual(mapped[6]?.source, { playerIndex: 0, area: 4, index: 0 });

  assert.equal(mapped[7]?.kind, "end");
  assert.equal(mapped[7]?.source, null);

  const hand0 = handActions(mapped, 0, 0);
  assert.equal(hand0.length, 1);
  assert.equal(hand0[0]?.playAs, "bench");

  const energyTargets = targetsFor(mapped, "attach", 1, 0);
  assert.equal(energyTargets.length, 2);

  const active = activeActions(mapped, 0);
  assert.equal(active.some((row) => row.kind === "attack"), true);
  assert.equal(active.some((row) => row.kind === "retreat"), true);

  const drop = findDropOption(
    mapped,
    { playerIndex: 0, area: 2, index: 1 },
    { playerIndex: 0, area: 4, index: 0 },
  );
  assert.equal(drop?.kind, "attach");
  assert.equal(drop?.optionIndex, 2);

  const benchDrop = findDropOption(
    mapped,
    { playerIndex: 0, area: 2, index: 0 },
    { playerIndex: 0, area: 5, index: 2 },
  );
  assert.equal(benchDrop?.kind, "play");

  const spots = playableSpots(mapped);
  assert.equal(
    spots.some((spot) => spot.area === 2 && spot.index === 0),
    true,
  );
  assert.equal(
    spots.some((spot) => spot.area === 4 && spot.index === 0),
    true,
  );

  const pick = mapOptions(
    obsWith({
      type: 1,
      context: 8,
      minCount: 1,
      maxCount: 1,
      option: [{ type: 3, area: 2, index: 3, playerIndex: 0 }],
    }),
    mapCards,
  );
  assert.equal(pick[0]?.kind, "select");
  assert.deepEqual(pick[0]?.source, { playerIndex: 0, area: 2, index: 3 });
  assert.equal(interactionMode(obsWith({ type: 0, context: 0, minCount: 1, maxCount: 1, option: [] }).select, "choose", true), "board");
  assert.equal(
    interactionMode(
      { type: 1, context: 8, minCount: 1, maxCount: 1, option: [{ type: 3, area: 3, index: 0, playerIndex: 0 }] },
      "choose",
      true,
    ),
    "picker",
  );
});

test("board html includes mute control and a Korean result screen when the match ends", () => {
  const live = boardHtml(view);
  assert.match(live, /data-sfx-mute/);
  assert.match(live, /소리 켜기/);
  assert.equal(live.includes("\u00b7"), false);

  const over = boardHtml({
    ...view,
    phase: "over",
    resultText: "이겼습니다. 프라이즈가 없습니다",
    options: [],
  });
  assert.match(over, /ptcg-fx-result/);
  assert.match(over, /다시 하기/);
  assert.match(over, /덱 고르기/);
  assert.match(over, /이겼습니다/);
});

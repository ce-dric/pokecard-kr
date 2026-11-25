import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { actionFromKey, actionFromPointer, boardHtml } from "./ui.ts";
import type { FaceCard, GameView, SideView } from "./view.ts";

const card: FaceCard = {
  name: "이브이",
  nameKo: "이브이",
  image: "game/cards/721-thumb.webp",
  fullImage: "game/cards/721.webp",
  hp: 70,
  maxHp: 70,
  energies: ["colorless"],
  kind: "포켓몬",
  typeLabel: "무색",
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
  minCount: 1,
  maxCount: 1,
  options: [
    { index: 0, label: "패 이브이", image: card.image, fullImage: card.fullImage },
    { index: 1, label: "턴 종료", image: null, fullImage: null },
  ],
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

test("board card images are zoom controls in every zone", () => {
  const html = boardHtml(view);
  assert.equal(html.includes("\u00b7"), false);
  const found = zones(html);
  for (const label of ["스타디움", "배틀필드", "벤치", "트래쉬"]) {
    const parts = found.get(label) || [];
    assert.equal(parts.length > 0, true, label);
    for (const part of parts) assertZoomThumb(part);
  }
  const hands = found.get("패") || [];
  assert.equal(hands.length, 2);
  assert.equal(hands[0].includes("<img"), false);
  assertZoomThumb(hands[1]);
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
  assert.match(html, /data-option="1"[^>]*>[\s\S]*턴 종료/);
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
  assert.equal(source.includes("\u00b7"), false);
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

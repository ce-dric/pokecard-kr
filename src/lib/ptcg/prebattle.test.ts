import assert from "node:assert/strict";
import test from "node:test";
import {
  coinMapsToFirst,
  coinTossHtml,
  goFirstOptionIndex,
  mulliganHtml,
  optionIndexForHandCard,
  prebattleHtml,
  prebattlePhase,
  revealNote,
  setupHtml,
  setupPrompt,
} from "./prebattle.ts";
import type { FaceCard, GameView, SideView } from "./view.ts";

const card = (name: string, image: string | null = "game/cards/721-thumb.webp"): FaceCard => ({
  name,
  nameKo: name,
  image,
  fullImage: image?.replace("-thumb.webp", ".webp") || null,
  hp: 70,
  maxHp: 70,
  energies: [],
  kind: "포켓몬",
  typeLabel: "물",
  tools: [],
  conditions: [],
  ex: false,
  megaEx: false,
  prizeValue: null,
});

function side(hand: FaceCard[] | null, active: FaceCard[] = [], bench: FaceCard[] = []): SideView {
  return {
    active,
    bench,
    hand,
    handCount: hand ? hand.length : 0,
    prizeCount: 0,
    discard: [],
    discardCount: 0,
    deckCount: 53,
    conditions: [],
  };
}

function baseView(over: Partial<GameView> = {}): GameView {
  return {
    phase: "choose",
    prompt: "고르세요",
    context: null,
    minCount: 1,
    maxCount: 1,
    options: [],
    log: [],
    you: side(null),
    opp: side(null),
    turn: 0,
    resultText: null,
    stadium: null,
    interaction: "board",
    ...over,
  };
}

test("prebattle phases cover coin, mulligan, and setup only", () => {
  assert.equal(prebattlePhase(baseView({ context: 41 })), "coin");
  assert.equal(prebattlePhase(baseView({ context: 42 })), "mulligan");
  assert.equal(prebattlePhase(baseView({ context: 1, turn: 0 })), "setup");
  assert.equal(prebattlePhase(baseView({ context: 38, turn: 0 })), "setup");
  assert.equal(prebattlePhase(baseView({ context: 2, turn: 0 })), "setup");
  assert.equal(prebattlePhase(baseView({ context: null, turn: 0 })), "setup");
  assert.equal(prebattlePhase(baseView({ context: 0, turn: 1 })), null);
  assert.equal(prebattlePhase(baseView({ context: 1, turn: 1 })), null);
});

test("coin toss maps heads to going first", () => {
  assert.equal(coinMapsToFirst("heads"), true);
  assert.equal(coinMapsToFirst("tails"), false);
  const options = [
    { index: 0, label: "예", image: null, fullImage: null },
    { index: 1, label: "아니오", image: null, fullImage: null },
  ];
  assert.equal(goFirstOptionIndex(options, true), 0);
  assert.equal(goFirstOptionIndex(options, false), 1);
});

test("coin toss html flips without a middle dot", () => {
  const idle = coinTossHtml({ flipped: false, side: null, reducedMotion: true });
  assert.match(idle, /data-coin-flip/);
  assert.match(idle, /코인 토스/);
  const done = coinTossHtml({ flipped: true, side: "heads", reducedMotion: true });
  assert.match(done, /data-coin-confirm/);
  assert.match(done, /내가 선공합니다/);
  assert.equal(done.includes("\u00b7"), false);
  assert.equal(idle.includes("\u00b7"), false);
});

test("setup prompt clarifies bench count and face-down placement", () => {
  const view = baseView({
    context: 38,
    prompt: "뽑을 장수를 고르세요",
    options: [
      { index: 0, label: "0장", image: null, fullImage: null },
      { index: 1, label: "1장", image: null, fullImage: null },
    ],
    you: side([card("가이오가")], [{ ...card("뒷면"), hidden: true, image: null }]),
    opp: side(null, [{ ...card("뒷면"), hidden: true, image: null }]),
  });
  assert.equal(setupPrompt(view), "벤치에 낼 장수를 고르세요");
  const html = setupHtml(view);
  assert.match(html, /대전 준비/);
  assert.match(html, /내지 않기/);
  assert.match(html, /벤치에 1장/);
  assert.match(html, /뒷면/);
  assert.match(html, /함께 공개/);
  assert.equal(html.includes("\u00b7"), false);
  assert.equal(revealNote(), "양쪽 포켓몬을 공개합니다");
});

test("hand cards map onto place-active options", () => {
  const kyogre = card("가이오가");
  const snover = card("눈쓰개", "game/cards/722-thumb.webp");
  const view = baseView({
    context: 1,
    options: [
      { index: 0, label: "패 가이오가", image: kyogre.image, fullImage: kyogre.fullImage },
      { index: 1, label: "패 눈쓰개", image: snover.image, fullImage: snover.fullImage },
    ],
    you: side([kyogre, snover, card("기본 물 에너지", null)]),
  });
  assert.equal(optionIndexForHandCard(view, 0), 0);
  assert.equal(optionIndexForHandCard(view, 1), 1);
  assert.equal(optionIndexForHandCard(view, 2), null);
  const html = prebattleHtml(view);
  assert.ok(html);
  assert.match(html!, /data-option="0"/);
  assert.match(html!, /data-option="1"/);
});

test("mulligan screen shows the opening hand and redraw choices", () => {
  const view = baseView({
    context: 42,
    options: [
      { index: 0, label: "예", image: null, fullImage: null },
      { index: 1, label: "아니오", image: null, fullImage: null },
    ],
    you: side([card("기본 물 에너지", null), card("릴리에의 결심", null)]),
  });
  const html = mulliganHtml(view);
  assert.match(html, /다시 뽑기/);
  assert.match(html, /이대로 두기/);
  assert.match(html, /첫 패/);
  assert.equal(html.includes("\u00b7"), false);
});

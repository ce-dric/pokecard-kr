import assert from "node:assert/strict";
import test from "node:test";
import {
  collectFxEvents,
  eventsFromLogLines,
  fxOverlayHtml,
  muteToggleHtml,
  newLogLines,
  prefersReducedMotion,
  resultScreenHtml,
  sfxForEvents,
  sfxMutedDefault,
  zoneFxClasses,
} from "./fx.ts";
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
  tools: [],
  conditions: [],
  ex: false,
  megaEx: false,
  prizeValue: null,
};

function side(overrides: Partial<SideView> = {}): SideView {
  return {
    active: [{ ...card }],
    bench: [],
    hand: [card],
    handCount: 1,
    prizeCount: 6,
    discard: [],
    discardCount: 0,
    deckCount: 40,
    conditions: [],
    ...overrides,
  };
}

function view(overrides: Partial<GameView> = {}): GameView {
  return {
    phase: "choose",
    prompt: "할 일을 고르세요",
    minCount: 1,
    maxCount: 1,
    options: [],
    log: ["내 턴"],
    you: side(),
    opp: side({ hand: null, handCount: 5 }),
    turn: 1,
    resultText: null,
    stadium: null,
    ...overrides,
  };
}

test("newLogLines returns only the suffix that grew", () => {
  assert.deepEqual(newLogLines(["내 턴"], ["내 턴", "나 드로우 이브이", "코인 앞"]), [
    "나 드로우 이브이",
    "코인 앞",
  ]);
  assert.deepEqual(newLogLines(["내 턴", "옛줄"], ["새시작"]), ["새시작"]);
});

test("eventsFromLogLines maps turn, draw, attack, trash, coin, and prize cues", () => {
  const events = eventsFromLogLines([
    "내 턴",
    "나 드로우 이브이",
    "상대 공격 전광석화 30",
    "이브이 HP 40",
    "이브이 트래쉬",
    "코인 뒤",
    "상대 턴",
  ]);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["turn", "draw", "attack", "damage", "trash", "coin", "turn"],
  );
  assert.equal(events.find((event) => event.kind === "coin")?.kind === "coin" && events.find((e) => e.kind === "coin")!.head, false);
  assert.equal(events.find((event) => event.kind === "turn" && event.side === "you")?.side, "you");
  assert.equal(events.find((event) => event.kind === "attack")?.side, "opp");
});

test("first paint does not replay the full log as motion", () => {
  assert.deepEqual(collectFxEvents(null, view({ log: ["내 턴", "나 드로우", "코인 앞"] })), []);
  const ended = collectFxEvents(null, view({ phase: "over", resultText: "졌습니다.", log: ["내 턴"] }));
  assert.equal(ended.length, 1);
  assert.equal(ended[0]?.kind, "result");
});

test("collectFxEvents merges log cues with board diffs for play, prize, ko, and result", () => {
  const prev = view({
    log: ["내 턴"],
    you: side({ handCount: 5, deckCount: 40, prizeCount: 6, active: [{ ...card, hp: 70 }] }),
  });
  const next = view({
    phase: "over",
    resultText: "이겼습니다. 프라이즈가 없습니다",
    log: ["내 턴", "나 드로우", "상대 공격 전광석화 70", "피카츄 HP 0", "피카츄 트래쉬"],
    you: side({
      handCount: 7,
      deckCount: 39,
      prizeCount: 5,
      discardCount: 1,
      discard: [card],
      active: [{ ...card, hp: 0, name: "피카츄" }],
      bench: [card],
    }),
    opp: side({ hand: null, handCount: 4, active: [{ ...card, hp: 40 }] }),
  });
  const kinds = collectFxEvents(prev, next).map((event) => event.kind);
  assert.ok(kinds.includes("draw"));
  assert.ok(kinds.includes("attack"));
  assert.ok(kinds.includes("damage") || kinds.includes("ko"));
  assert.ok(kinds.includes("trash") || kinds.includes("ko"));
  assert.ok(kinds.includes("prize") || kinds.includes("play"));
  assert.ok(kinds.includes("result"));
  const result = collectFxEvents(prev, next).find((event) => event.kind === "result");
  assert.equal(result?.kind === "result" && result.outcome, "win");
});

test("zoneFxClasses mark attacker, defender, hand, and trash without motion when reduced", () => {
  const events = eventsFromLogLines(["나 공격 몸통박치기 30", "상대 포켓몬 HP 40", "코인 앞"]);
  const full = zoneFxClasses(events, false);
  assert.ok(full.youActive.includes("ptcg-fx-lunge"));
  assert.ok(full.oppActive.includes("ptcg-fx-hit") || full.oppActive.includes("ptcg-fx-shake"));
  assert.equal(zoneFxClasses(events, true).youActive.includes("ptcg-fx-lunge"), false);
});

test("fx overlays show Korean turn banner, coin face, damage, and skip motion class when reduced", () => {
  const html = fxOverlayHtml(
    [
      { kind: "turn", side: "you" },
      { kind: "coin", head: true },
      { kind: "damage", side: "opp", amount: 30 },
    ],
    false,
  );
  assert.match(html, /내 턴/);
  assert.match(html, /앞/);
  assert.match(html, /30/);
  assert.equal(html.includes("\u00b7"), false);
  assert.match(html, /ptcg-fx-overlay/);
  const quiet = fxOverlayHtml([{ kind: "turn", side: "opp" }], true);
  assert.match(quiet, /상대 턴/);
  assert.match(quiet, /ptcg-fx-reduced/);
});

test("result screen and mute toggle copy stay Korean with sound off by default", () => {
  assert.match(resultScreenHtml("이겼습니다.", "win"), /다시 하기/);
  assert.match(resultScreenHtml("졌습니다.", "lose"), /덱 고르기/);
  assert.match(muteToggleHtml(true), /소리 켜기/);
  assert.match(muteToggleHtml(false), /소리 끄기/);
  assert.equal(sfxMutedDefault(null), true);
  assert.equal(sfxMutedDefault({ getItem: () => "0" }), false);
  assert.equal(prefersReducedMotion({ matches: true }), true);
  assert.equal(prefersReducedMotion({ matches: false }), false);
  assert.deepEqual(sfxForEvents([{ kind: "attack", side: "you" }, { kind: "coin", head: true }]), ["attack", "coin"]);
});

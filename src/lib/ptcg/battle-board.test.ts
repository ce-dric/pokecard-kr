import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardHtml, EMPTY_UI, groupHandCards, turnOwnerLabel } from "./battle-board.ts";
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

const energy: FaceCard = {
  id: 14,
  name: "기본 무색 에너지",
  nameKo: "기본 무색 에너지",
  image: "game/cards/14-thumb.webp",
  fullImage: "game/cards/14.webp",
  hp: null,
  maxHp: null,
  energies: [],
  kind: "에너지",
  typeLabel: "무색",
  tools: [],
  conditions: [],
  ex: false,
  megaEx: false,
  prizeValue: null,
};

function side(hand: FaceCard[] | null, prizeCount = 6): SideView {
  return {
    active: [card],
    bench: [card],
    hand,
    handCount: hand ? hand.length : 5,
    prizeCount,
    discard: [card],
    discardCount: 1,
    deckCount: 40,
    conditions: [],
  };
}

const view: GameView = {
  phase: "choose",
  prompt: "할 일을 고르세요",
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
  log: ["내 턴", "드로우"],
  you: side([card, card, card, energy, energy], 4),
  opp: side(null, 5),
  turn: 3,
  resultText: null,
  stadium: card,
};

test("battle board is a fixed app shell with HUD, fan hand, and log drawer", () => {
  const html = boardHtml(view);
  assert.equal(html.includes("\u00b7"), false);
  assert.match(html, /class="ptcg-battle"/);
  assert.match(html, /data-battle/);
  assert.match(html, /data-battle-dock/);
  assert.match(html, /data-action-sheet/);
  assert.match(html, /class="ptcg-battle-hud"/);
  assert.match(html, /턴 3/);
  assert.match(html, /내 턴/);
  assert.match(html, /프라이즈 나 4 \/ 상대 5/);
  assert.match(html, /data-exit/);
  assert.match(html, />나가기</);
  assert.match(html, /class="ptcg-hud-end"[^>]*data-option="1"/);
  assert.match(html, /data-log-open/);
  assert.match(html, /data-log-drawer/);
  assert.match(html, /ptcg-hand--fan/);
  assert.match(html, /ptcg-fan-card/);
  assert.match(html, /ptcg-hand--backs/);
  assert.match(html, /aria-label="상대 패 5"/);
  assert.match(html, /ptcg-zone-label">패 5</);
  assert.doesNotMatch(html, /ptcg-opp-hand[\s\S]*ptcg-count/);
  assert.doesNotMatch(html, /ptcg-stack-count/);
  assert.doesNotMatch(html, /<details class="ptcg-log-panel"/);
});

test("identical hand cards collapse into a channel-style stack with a count badge", () => {
  const groups = groupHandCards([card, energy, card, card, energy]);
  assert.deepEqual(
    groups.map((group) => [group.card.id, group.count, group.indices]),
    [
      [721, 3, [0, 2, 3]],
      [14, 2, [1, 4]],
    ],
  );
  const html = boardHtml(view);
  assert.match(html, /ptcg-hand-stack[^>]*data-card-id="721"[^>]*data-count="3"/);
  assert.match(html, /ptcg-hand-stack-badge">x3</);
  assert.match(html, /ptcg-hand-stack[^>]*data-card-id="14"[^>]*data-count="2"/);
  assert.match(html, /ptcg-hand-stack-badge">x2</);
  assert.match(html, /ptcg-hand-stack-layer/);
});

test("trash deck and prizes render as stacked piles that open a sheet", () => {
  const html = boardHtml(view);
  assert.match(html, /ptcg-pile--trash/);
  assert.match(html, /ptcg-pile--deck/);
  assert.match(html, /ptcg-pile--prizes/);
  assert.match(html, /data-pile-open="pile-you-trash"/);
  assert.match(html, /data-pile-body="pile-you-trash"/);
  assert.match(html, /data-pile-sheet/);
  assert.match(html, /data-pile-sheet-close/);
  assert.match(html, /ptcg-zone--trash[\s\S]*ptcg-pile--trash/);
  assert.match(html, /template data-pile-body="pile-you-trash"[\s\S]*?<\/template>/);
});

test("turn owner label follows the prompt and phase", () => {
  assert.equal(turnOwnerLabel(view), "내 턴");
  assert.equal(turnOwnerLabel({ ...view, prompt: "상대가 고르는 중", options: [] }), "상대 턴");
  assert.equal(turnOwnerLabel({ ...view, phase: "over", prompt: "대전이 끝났습니다" }), "종료");
});

test("battle CSS puts active toward the center and bench toward each edge", () => {
  const css = readFileSync(new URL("../../pages/game/battle.css", import.meta.url), "utf8");
  assert.equal(css.includes("\u00b7"), false);
  assert.match(css, /100dvh|100svh/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /ptcg-action-sheet/);
  assert.match(css, /body\.ptcg-battle-active \.site-header/);
  assert.match(css, /body\.ptcg-battle-active \.site-footer/);
  assert.match(css, /\.ptcg-hand--fan/);
  assert.match(css, /\.ptcg-log-drawer/);
  assert.match(css, /aspect-ratio:\s*10\s*\/\s*16/);
  assert.match(
    css,
    /ptcg-playmat--you[\s\S]*grid-template-areas:[\s\S]*"head"[\s\S]*"field"/,
  );
  assert.match(
    css,
    /ptcg-playmat--opp[\s\S]*grid-template-areas:[\s\S]*"head"[\s\S]*"hand"[\s\S]*"field"/,
  );
  assert.match(css, /ptcg-zone--rails/);
  assert.match(css, /\.ptcg-field/);
  assert.match(css, /--card-edge-w:\s*clamp\(3\.[45]rem/);
  assert.match(css, /--card-hand-w/);
  assert.match(css, /ptcg-hud-skip/);
});

test("battle board wraps active and bench in a field cluster", () => {
  const html = boardHtml(view);
  assert.match(html, /ptcg-field/);
  assert.match(html, /ptcg-playmat--opp[\s\S]*ptcg-zone--bench[\s\S]*ptcg-zone--active/);
  assert.match(html, /ptcg-playmat--you[\s\S]*ptcg-zone--active[\s\S]*ptcg-zone--bench/);
});

test("bot turn keeps the action sheet closed and marks the battle shell", () => {
  const html = boardHtml(view, "", { botTurn: true, ui: EMPTY_UI });
  assert.match(html, /data-bot-turn="true"/);
  assert.match(html, /data-action-sheet[^>]*hidden/);
  assert.match(html, /상대 턴/);
  assert.match(html, /ptcg-hud-skip[^>]*data-skip-bot/);
  assert.doesNotMatch(html, /ptcg-bot-banner/);
  assert.doesNotMatch(html, /ptcg-fallback/);
});

test("the game page loads battle CSS next to the lobby styles", () => {
  const page = readFileSync(new URL("../../pages/game/index.astro", import.meta.url), "utf8");
  assert.match(page, /battle\.css/);
  assert.match(page, /gameCss\}\$\{battleCss/);
});

import { esc, imageSrc } from "./html.ts";
import type { ChoiceOption, FaceCard, GameView } from "./view.ts";

export type PrebattlePhase = "coin" | "mulligan" | "setup" | null;

export type CoinSide = "heads" | "tails";

/** After the coin result shows, advance without requiring 확인. */
export const COIN_AUTO_ADVANCE_MS = 3000;

/** Engine contexts that belong to the opening setup, before turn 1. */
const SETUP_CONTEXTS = new Set([1, 2, 38]);

export function createCoinAutoAdvance(deps: {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  delayMs?: number;
}): { arm: (onAdvance: () => void) => void; clear: () => void } {
  let timer: unknown = null;
  const delay = deps.delayMs ?? COIN_AUTO_ADVANCE_MS;
  return {
    arm(onAdvance: () => void) {
      if (timer != null) deps.clearTimeout(timer);
      timer = deps.setTimeout(() => {
        timer = null;
        onAdvance();
      }, delay);
    },
    clear() {
      if (timer == null) return;
      deps.clearTimeout(timer);
      timer = null;
    },
  };
}

export function prebattlePhase(view: GameView): PrebattlePhase {
  if (view.phase === "over") return null;
  if (view.context === 41) return "coin";
  if (view.context === 42) return "mulligan";
  // Stay on the setup screen for the whole opening (including while the bot places).
  if (view.turn === 0 && (view.context == null || SETUP_CONTEXTS.has(view.context))) return "setup";
  return null;
}

export function coinMapsToFirst(side: CoinSide): boolean {
  return side === "heads";
}

/** Yes = type 1 / "예", No = type 2 / "아니오" in the go-first prompt. */
export function goFirstOptionIndex(options: ChoiceOption[], goFirst: boolean): number {
  const want = goFirst ? "예" : "아니오";
  const labeled = options.findIndex((option) => option.label === want);
  if (labeled >= 0) return labeled;
  return goFirst ? 0 : Math.min(1, Math.max(0, options.length - 1));
}

export function setupPrompt(view: GameView): string {
  if (view.context === 38) return "벤치에 낼 장수를 고르세요";
  if (view.context === 1) return "배틀필드에 낼 기본 포켓몬을 고르세요";
  if (view.context === 2) return "벤치에 낼 기본 포켓몬을 고르세요";
  if (view.context === 42) return "기본 포켓몬이 없습니다. 다시 뽑을까요";
  return view.prompt;
}

function handCardHtml(card: FaceCard, optionIndex: number | null): string {
  const src = imageSrc(card.image);
  const name = esc(card.name);
  const body = src
    ? `<img src="${esc(src)}" alt="${name}" width="96" height="134" loading="lazy" decoding="async" />`
    : `<span class="ptcg-textcard"><strong>${name}</strong></span>`;
  if (optionIndex == null) {
    return `<div class="ptcg-pre-card">${body}<span class="ptcg-caption">${name}</span></div>`;
  }
  return `<button type="button" class="ptcg-pre-card" data-option="${optionIndex}">${body}<span class="ptcg-caption">${name}</span></button>`;
}

/** Map a hand slot to a selectable option index when the engine offers that card. */
export function optionIndexForHandCard(view: GameView, handIndex: number): number | null {
  const hand = view.you.hand;
  if (!hand || !hand[handIndex]) return null;
  const card = hand[handIndex];
  const candidates = view.options.filter((option) => {
    if (option.image && card.image && option.image === card.image) return true;
    return option.label.includes(card.name);
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].index;
  let seen = 0;
  for (let i = 0; i < handIndex; i += 1) {
    if (hand[i]?.name === card.name) seen += 1;
  }
  return candidates[seen]?.index ?? candidates[0].index;
}

function faceDownSlot(label: string, filled: boolean): string {
  if (!filled) {
    return `<div class="ptcg-card"><div class="ptcg-empty ptcg-slot" aria-label="${esc(label)}">${esc(label)}</div></div>`;
  }
  return `<div class="ptcg-card"><div class="ptcg-back" aria-label="${esc(label)} 뒷면"></div></div>`;
}

function setupBoard(view: GameView): string {
  const youActiveFilled = view.you.active.length > 0;
  const oppActiveFilled = view.opp.active.length > 0;
  const youBench = Array.from({ length: 5 }, (_, index) =>
    faceDownSlot("벤치", index < view.you.bench.length),
  ).join("");
  const oppBench = Array.from({ length: 5 }, (_, index) =>
    faceDownSlot("벤치", index < view.opp.bench.length),
  ).join("");
  // Match the battle board: active toward the center, bench toward each edge.
  return `<div class="ptcg-pre-board" aria-label="준비 중인 필드">
    <section class="ptcg-pre-side ptcg-pre-side--opp" aria-label="상대">
      <h3>상대</h3>
      <div class="ptcg-pre-bench">${oppBench}</div>
      <div class="ptcg-pre-active">${faceDownSlot("배틀", oppActiveFilled)}</div>
    </section>
    <section class="ptcg-pre-side ptcg-pre-side--you" aria-label="나">
      <h3>나</h3>
      <div class="ptcg-pre-active">${faceDownSlot("배틀", youActiveFilled)}</div>
      <div class="ptcg-pre-bench">${youBench}</div>
    </section>
  </div>`;
}

function numberOptions(view: GameView): string {
  return view.options
    .map((option) => {
      const nice =
        view.context === 38 && /^\d+장$/.test(option.label)
          ? option.label === "0장"
            ? "내지 않기"
            : `벤치에 ${option.label}`
          : option.label;
      return `<button type="button" data-option="${option.index}">${esc(nice)}</button>`;
    })
    .join("");
}

function yesNoOptions(view: GameView): string {
  return view.options
    .map((option) => {
      let label = option.label;
      if (view.context === 42) {
        if (option.label === "예") label = "다시 뽑기";
        if (option.label === "아니오") label = "이대로 두기";
      }
      return `<button type="button" data-option="${option.index}">${esc(label)}</button>`;
    })
    .join("");
}

export function coinTossHtml(state: {
  flipped: boolean;
  side: CoinSide | null;
  reducedMotion: boolean;
}): string {
  const sideLabel = state.side === "heads" ? "앞" : state.side === "tails" ? "뒤" : "";
  const first = state.side ? (coinMapsToFirst(state.side) ? "내가 선공합니다" : "상대가 선공합니다") : "";
  const coinClass = [
    "ptcg-coin",
    state.flipped ? "is-flipped" : "",
    state.side === "heads" ? "is-heads" : "",
    state.side === "tails" ? "is-tails" : "",
    state.reducedMotion ? "is-reduced" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const actions = !state.flipped
    ? `<button type="button" data-coin-flip>코인 던지기</button>`
    : `<p class="ptcg-pre-result" role="status">${esc(sideLabel)} - ${esc(first)}</p>
       <p class="ptcg-note ptcg-coin-auto" data-coin-auto>3초 뒤 자동으로 넘어갑니다</p>
       <button type="button" data-coin-confirm>확인</button>`;
  return `<div class="ptcg-prebattle ptcg-coin-screen">
    <h2>코인 토스</h2>
    <p class="ptcg-note">앞이면 내가 선공, 뒤면 상대가 선공합니다.</p>
    <div class="${coinClass}" aria-hidden="true">
      <span class="ptcg-coin-face ptcg-coin-heads">앞</span>
      <span class="ptcg-coin-face ptcg-coin-tails">뒤</span>
    </div>
    <div class="ptcg-pre-actions">${actions}</div>
  </div>`;
}

export function mulliganHtml(view: GameView): string {
  const hand = (view.you.hand || [])
    .map((card, index) => handCardHtml(card, optionIndexForHandCard(view, index)))
    .join("");
  return `<div class="ptcg-prebattle ptcg-mulligan-screen">
    <h2>첫 패</h2>
    <p class="ptcg-prompt" role="status">${esc(setupPrompt(view))}</p>
    <div class="ptcg-pre-hand" aria-label="내 패">${hand || `<p class="ptcg-count">패 ${view.you.handCount}</p>`}</div>
    <div class="ptcg-pre-actions ptcg-options" role="group" aria-label="멀리건">${yesNoOptions(view)}</div>
  </div>`;
}

export function setupHtml(view: GameView): string {
  const hand = (view.you.hand || [])
    .map((card, index) => handCardHtml(card, optionIndexForHandCard(view, index)))
    .join("");
  const waiting = view.options.length === 0;
  const multi = !waiting && view.maxCount >= 1 && !(view.maxCount === 1 && view.minCount >= 1);
  const confirm = multi
    ? `<button type="button" data-confirm${view.minCount > 0 ? " disabled" : ""}>${view.minCount === 0 ? "넘기기" : "결정"}</button>`
    : "";
  const extras =
    !waiting &&
    (view.context === 38 ||
      view.options.every(
        (option) => /^\d+장$/.test(option.label) || option.label === "예" || option.label === "아니오",
      ))
      ? numberOptions(view)
      : "";
  const loose = view.options
    .filter((option) => !option.image && !/^\d+장$/.test(option.label))
    .map((option) => `<button type="button" data-option="${option.index}">${esc(option.label)}</button>`)
    .join("");
  const prompt = waiting ? "상대가 준비하는 중" : setupPrompt(view);
  return `<div class="ptcg-prebattle ptcg-setup-screen">
    <h2>대전 준비</h2>
    <p class="ptcg-prompt" role="status">${esc(prompt)}</p>
    ${setupBoard(view)}
    <div class="ptcg-pre-hand" aria-label="내 패">${hand || `<p class="ptcg-count">패 ${view.you.handCount}</p>`}</div>
    <div class="ptcg-pre-actions ptcg-options" role="group" aria-label="선택">${extras}${loose}${confirm}</div>
    <p class="ptcg-note">포켓몬은 뒷면으로 두고, 양쪽이 준비를 마치면 함께 공개합니다.</p>
  </div>`;
}

export function revealNote(): string {
  return "양쪽 포켓몬을 공개합니다";
}

export function prebattleHtml(
  view: GameView,
  coin?: { flipped: boolean; side: CoinSide | null; reducedMotion: boolean },
): string | null {
  const phase = prebattlePhase(view);
  if (phase === "coin") {
    return coinTossHtml(coin || { flipped: false, side: null, reducedMotion: false });
  }
  if (phase === "mulligan") return mulliganHtml(view);
  if (phase === "setup") return setupHtml(view);
  return null;
}

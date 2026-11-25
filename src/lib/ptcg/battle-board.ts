import type { CardSpot } from "./actions.ts";
import { playCardHtml } from "./board-card.ts";
import { flashClass, type BoardHighlight } from "./bot-highlight.ts";
import {
  muteToggleHtml,
  resultOutcome,
  resultScreenHtml,
} from "./fx.ts";
import {
  attackSheetHtml,
  boardPlayable,
  fallbackOptionsHtml,
  handActionMenuHtml,
  highlightClass,
  pickerHtml,
  quickActionsHtml,
  spotKey,
} from "./interact-ui.ts";
import type { FaceCard, GameView } from "./view.ts";

const ENERGY_CLASS: Record<string, string> = {
  colorless: "swatch-colorless",
  grass: "swatch-grass",
  fire: "swatch-fire",
  water: "swatch-water",
  electric: "swatch-electric",
  psychic: "swatch-psychic",
  fighting: "swatch-fighting",
  dark: "swatch-dark",
  steel: "swatch-steel",
  dragon: "swatch-dragon",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function imageSrc(path: string | null): string | null {
  if (!path || !/^(?:images\/cards\/[a-z0-9-]+\/[A-Za-z0-9.-]+|game\/cards\/\d+(?:-thumb)?\.webp)$/.test(path)) return null;
  const base = import.meta.env?.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(path, origin + root).href;
}

function zoomButton(src: string, full: string, label: string, width: number, height: number): string {
  return `<button type="button" class="ptcg-zoom-image" data-zoom-open data-full="${esc(full)}" data-alt="${label}" aria-label="${label} 확대"><img src="${esc(src)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" /></button>`;
}

export interface ViewUiState {
  selected: CardSpot | null;
  targets: CardSpot[];
  sheet: "none" | "hand" | "attack";
}

export interface BoardPaintOptions {
  note?: string;
  botTurn?: boolean;
  highlights?: BoardHighlight[];
  ui?: ViewUiState;
  muted?: boolean;
}

export const EMPTY_UI: ViewUiState = { selected: null, targets: [], sheet: "none" };

function isViewUiState(value: unknown): value is ViewUiState {
  return Boolean(value && typeof value === "object" && "selected" in value && "targets" in value && "sheet" in value);
}

interface CardRenderOpts {
  caption: boolean;
  spot?: CardSpot | null;
  playable?: CardSpot[];
  selected?: CardSpot | null;
  targets?: CardSpot[];
  draggable?: boolean;
}

interface SideRenderOpts {
  playable: CardSpot[];
  selected: CardSpot | null;
  targets: CardSpot[];
  playerIndex: number;
  interactive: boolean;
}

function spotCanAct(
  spot: CardSpot | null | undefined,
  playable: CardSpot[],
  targets: CardSpot[],
  draggable?: boolean,
): boolean {
  if (!spot) return false;
  if (draggable) return true;
  return (
    playable.some((row) => row.area === spot.area && row.index === spot.index && row.playerIndex === spot.playerIndex) ||
    targets.some((row) => row.area === spot.area && row.index === spot.index && row.playerIndex === spot.playerIndex)
  );
}

function spotAttrs(spot: CardSpot | null | undefined, canAct: boolean, draggable: boolean): string {
  if (!spot) return "";
  const parts = [` data-spot="${spotKey(spot)}"`];
  if (draggable) parts.push(` draggable="true" tabindex="0" data-card-act`);
  else if (canAct) parts.push(` tabindex="0" data-card-act`);
  return parts.join("");
}

function playSpotHtml(card: FaceCard, active: boolean, spot: CardSpot, opts: SideRenderOpts): string {
  const hi = highlightClass(spot, opts.playable, opts.selected, opts.targets);
  const canAct = spotCanAct(spot, opts.playable, opts.targets, false);
  return playCardHtml(card, {
    active,
    className: hi,
    attrs: spotAttrs(spot, canAct, false),
  });
}

function cardHtml(card: FaceCard, opts: CardRenderOpts): string {
  const playable = opts.playable || [];
  const targets = opts.targets || [];
  const hi = highlightClass(opts.spot, playable, opts.selected || null, targets);
  const canAct = spotCanAct(opts.spot, playable, targets, opts.draggable);
  const shell = spotAttrs(opts.spot, canAct, Boolean(opts.draggable));
  if (card.hidden) {
    return `<div class="ptcg-card ${hi}"${shell}><div class="ptcg-back" aria-label="뒷면"></div></div>`;
  }
  const src = imageSrc(card.image);
  const full = imageSrc(card.fullImage || card.image);
  const name = esc(card.name);
  const hp = card.hp != null && card.maxHp != null ? `${card.hp}/${card.maxHp}` : "";
  const energies = card.energies
    .map((energy) => `<i class="swatch ${ENERGY_CLASS[energy] || "swatch-colorless"}"></i>`)
    .join("");
  const body =
    src && full
      ? zoomButton(src, full, name, 120, 168)
      : src
        ? `<img src="${esc(src)}" alt="${name}" width="120" height="168" loading="lazy" decoding="async" />`
        : `<div class="ptcg-textcard"><span>${esc(card.typeLabel || card.kind || "카드")}</span><strong>${name}</strong><span>${hp ? `HP ${esc(hp.split("/")[1] || hp)}` : ""}</span></div>`;
  const meta = opts.caption ? `<span class="ptcg-caption">${name}${hp ? ` ${esc(hp)}` : ""}</span>${energies ? `<span class="ptcg-energies">${energies}</span>` : ""}` : "";
  return `<div class="ptcg-card ${hi}"${shell}>${body}${meta}</div>`;
}

function emptySlot(label: string, spot?: CardSpot | null, targets: CardSpot[] = []): string {
  const hi = highlightClass(spot, [], null, targets);
  const spotAttr = spot ? ` data-spot="${spotKey(spot)}" data-drop-slot` : "";
  return `<div class="ptcg-card ${hi}"${spotAttr}><div class="ptcg-empty ptcg-slot" aria-label="${esc(label)}">${esc(label)}</div></div>`;
}

function prizeGrid(count: number): string {
  const capped = Math.max(0, Math.min(6, count));
  const cells = Array.from({ length: 6 }, (_, index) => {
    if (index < capped) {
      return `<div class="ptcg-card ptcg-prize-card"><div class="ptcg-back" aria-hidden="true"></div></div>`;
    }
    return `<div class="ptcg-card ptcg-prize-card ptcg-prize-card--gone"><div class="ptcg-empty" aria-hidden="true"></div></div>`;
  }).join("");
  return `<div class="ptcg-prize-grid" aria-label="프라이즈 ${capped}">${cells}</div>`;
}

function benchSlots(cards: FaceCard[], opts: SideRenderOpts, highlights: BoardHighlight[] = [], role: "you" | "opp" = "you"): string {
  return Array.from({ length: 5 }, (_, index) => {
    const spot = { playerIndex: opts.playerIndex, area: 5, index };
    const card = cards[index];
    const body = card ? playSpotHtml(card, false, spot, opts) : emptySlot("빈자리", spot, opts.targets);
    const flash = flashClass(highlights, role, "bench", index);
    return flash ? `<div class="ptcg-flash-wrap${flash}">${body}</div>` : body;
  }).join("");
}

function pileLayers(depth: number): string {
  const n = Math.max(0, Math.min(depth, 3));
  return Array.from({ length: n }, (_, index) => `<span class="ptcg-pile-layer" style="--pile-i:${index + 1}" aria-hidden="true"></span>`).join("");
}

function faceThumb(card: FaceCard): string {
  const src = imageSrc(card.image);
  const name = esc(card.name);
  if (src) return `<img src="${esc(src)}" alt="" width="120" height="168" loading="lazy" decoding="async" />`;
  return `<div class="ptcg-textcard"><strong>${name}</strong></div>`;
}

function trashPile(side: GameView["you"], role: "you" | "opp", opts: SideRenderOpts): string {
  const id = `pile-${role}-trash`;
  const count = side.discard.length;
  if (!count) {
    return `<div class="ptcg-cards"><div class="ptcg-card"><div class="ptcg-empty">없음</div></div></div>`;
  }
  const top = side.discard[count - 1];
  const body = side.discard
    .map((card, index) =>
      cardHtml(card, {
        caption: true,
        spot: { playerIndex: opts.playerIndex, area: 3, index },
        playable: opts.playable,
        selected: opts.selected,
        targets: opts.targets,
      }),
    )
    .join("");
  return `<div class="ptcg-cards ptcg-pile-wrap">
    <button type="button" class="ptcg-pile ptcg-pile--trash" data-pile-open="${id}" aria-label="트래쉬 ${count}장">
      ${pileLayers(Math.min(count - 1, 3))}
      <span class="ptcg-pile-top ptcg-card">${faceThumb(top)}</span>
      <span class="ptcg-pile-badge">${count}</span>
    </button>
  </div>
  <template data-pile-body="${id}" data-pile-title="트래쉬 (${count})">${body}</template>`;
}

function deckPile(count: number, role: "you" | "opp"): string {
  const id = `pile-${role}-deck`;
  if (!count) {
    return `<div class="ptcg-cards"><div class="ptcg-card"><div class="ptcg-empty">없음</div></div></div>`;
  }
  return `<div class="ptcg-cards ptcg-pile-wrap">
    <button type="button" class="ptcg-pile ptcg-pile--deck" data-pile-open="${id}" aria-label="덱 ${count}장">
      ${pileLayers(Math.min(3, Math.max(1, Math.ceil(count / 20))))}
      <span class="ptcg-pile-top ptcg-card"><span class="ptcg-back" aria-hidden="true"><span class="ptcg-stack-count">${count}</span></span></span>
      <span class="ptcg-pile-badge">${count}</span>
    </button>
  </div>
  <template data-pile-body="${id}" data-pile-title="덱 (${count})"><p class="ptcg-pile-note">덱 ${count}장 (뒷면)</p></template>`;
}

function prizePile(count: number, role: "you" | "opp"): string {
  const id = `pile-${role}-prizes`;
  const capped = Math.max(0, Math.min(6, count));
  return `<div class="ptcg-cards ptcg-pile-wrap">
    <button type="button" class="ptcg-pile ptcg-pile--prizes" data-pile-open="${id}" aria-label="프라이즈 ${capped}장">
      ${pileLayers(capped > 0 ? Math.min(capped, 3) : 0)}
      <span class="ptcg-pile-top ptcg-card">${capped ? `<span class="ptcg-back" aria-hidden="true"></span>` : `<span class="ptcg-empty">없음</span>`}</span>
      <span class="ptcg-pile-badge">${capped}</span>
    </button>
  </div>
  <template data-pile-body="${id}" data-pile-title="프라이즈 (${capped})">${prizeGrid(capped)}</template>`;
}

function handKey(card: FaceCard): string {
  if (card.id != null) return `id:${card.id}`;
  return `name:${card.name}|${card.image || ""}`;
}

export function groupHandCards(cards: FaceCard[]): { card: FaceCard; count: number; indices: number[] }[] {
  const groups: { card: FaceCard; count: number; indices: number[] }[] = [];
  const indexByKey = new Map<string, number>();
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const key = handKey(card);
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, groups.length);
      groups.push({ card, count: 1, indices: [i] });
    } else {
      groups[existing].count += 1;
      groups[existing].indices.push(i);
    }
  }
  return groups;
}

function handStackLayers(count: number): string {
  const depth = Math.min(Math.max(count - 1, 0), 3);
  return Array.from({ length: depth }, (_, index) => {
    const i = depth - index;
    return `<span class="ptcg-hand-stack-layer" style="--stack-i:${i}" aria-hidden="true"></span>`;
  }).join("");
}

function oppHandBacks(count: number): string {
  const n = Math.max(0, Math.min(count, 10));
  const backs = Array.from({ length: Math.min(n, 5) }, () => `<div class="ptcg-card ptcg-hand-back"><div class="ptcg-back" aria-hidden="true"></div></div>`).join("");
  return `<div class="ptcg-opp-hand" aria-label="상대 패 ${count}"><div class="ptcg-cards ptcg-hand ptcg-hand--backs">${backs || `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`}</div><span class="ptcg-count">패 ${count}</span></div>`;
}

function pickHandIndex(indices: number[], opts: SideRenderOpts): number {
  for (const index of indices) {
    const spot = { playerIndex: opts.playerIndex, area: 2, index };
    if (spotCanAct(spot, opts.playable, opts.targets, true)) return index;
  }
  return indices[0];
}

function fanHand(cards: FaceCard[], opts: SideRenderOpts): string {
  if (!cards.length) {
    return `<div class="ptcg-cards ptcg-hand ptcg-hand--fan" aria-label="패 0"><div class="ptcg-card"><div class="ptcg-empty">없음</div></div></div>`;
  }
  const groups = groupHandCards(cards);
  const mid = (groups.length - 1) / 2;
  const items = groups
    .map((group, index) => {
      const handIndex = pickHandIndex(group.indices, opts);
      const spot = { playerIndex: opts.playerIndex, area: 2, index: handIndex };
      const canDrag =
        opts.interactive &&
        opts.playable.some((row) => row.area === 2 && row.index === handIndex && row.playerIndex === opts.playerIndex);
      const offset = index - mid;
      const rotate = offset * 4.5;
      const lift = Math.abs(offset) * 2;
      const badge = group.count > 1 ? `<span class="ptcg-hand-stack-badge">x${group.count}</span>` : "";
      const layers = handStackLayers(group.count);
      const front = cardHtml(group.card, {
        caption: false,
        spot,
        playable: opts.playable,
        selected: opts.selected,
        targets: opts.targets,
        draggable: canDrag,
      });
      return `<div class="ptcg-fan-card ptcg-hand-stack" data-card-id="${group.card.id ?? ""}" data-count="${group.count}" style="--fan-i:${offset};--fan-rot:${rotate}deg;--fan-lift:${lift}px">${layers}${front}${badge}</div>`;
    })
    .join("");
  return `<div class="ptcg-cards ptcg-hand ptcg-hand--fan" aria-label="패 ${cards.length}">${items}</div>`;
}

function sideHtml(
  title: string,
  side: GameView["you"],
  role: "you" | "opp",
  opts: SideRenderOpts,
  highlights: BoardHighlight[] = [],
): string {
  const active =
    side.active
      .map((card, index) => playSpotHtml(card, true, { playerIndex: opts.playerIndex, area: 4, index }, opts))
      .join("") || `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`;
  const handBlock =
    role === "opp"
      ? `<div class="ptcg-zone ptcg-zone--hand${flashClass(highlights, role, "hand")}"><span class="ptcg-zone-label">패</span>${oppHandBacks(side.handCount)}</div>`
      : "";
  return `<section class="ptcg-playmat ptcg-playmat--${role}" aria-label="${esc(title)}">
    <header class="ptcg-playmat-head"><h2>${esc(title)}</h2></header>
    ${handBlock}
    <div class="ptcg-zone ptcg-zone--prizes${flashClass(highlights, role, "prizes")}"><span class="ptcg-zone-label">프라이즈</span>${prizePile(side.prizeCount, role)}</div>
    <div class="ptcg-zone ptcg-zone--bench"><span class="ptcg-zone-label">벤치</span><div class="ptcg-cards ptcg-bench">${benchSlots(side.bench, opts, highlights, role)}</div></div>
    <div class="ptcg-zone ptcg-zone--deck${flashClass(highlights, role, "deck")}"><span class="ptcg-zone-label">덱</span>${deckPile(side.deckCount, role)}</div>
    <div class="ptcg-zone ptcg-zone--active${flashClass(highlights, role, "active")}"><span class="ptcg-zone-label">배틀필드</span><div class="ptcg-cards">${active}</div></div>
    <div class="ptcg-zone ptcg-zone--trash${flashClass(highlights, role, "trash")}"><span class="ptcg-zone-label">트래쉬</span>${trashPile(side, role, opts)}</div>
  </section>`;
}

function optionHtml(option: GameView["options"][number]): string {
  const src = imageSrc(option.image);
  const full = imageSrc(option.fullImage || option.image);
  const label = esc(option.label);
  const select = `<button type="button" data-option="${option.index}"><span>${label}</span></button>`;
  if (!src || !full) return select;
  const image = zoomButton(src, full, label, 72, 100);
  const zoom = `<button type="button" class="ptcg-enlarge" data-zoom-open data-full="${esc(full)}" data-alt="${label}" aria-label="${label} 확대">확대</button>`;
  return `<div class="ptcg-option">${image}${select}${zoom}</div>`;
}

export function turnOwnerLabel(view: GameView): string {
  if (view.phase === "over") return "종료";
  if (view.prompt === "상대가 고르는 중") return "상대 턴";
  return "내 턴";
}

function endTurnOption(view: GameView): GameView["options"][number] | null {
  return view.options.find((option) => option.kind === "end" || option.label === "턴 종료") || null;
}

function battleBoardHtml(
  view: GameView,
  note: string,
  ui: ViewUiState = EMPTY_UI,
  muted = true,
  botTurn = false,
  highlights: BoardHighlight[] = [],
): string {
  const playable = !botTurn && view.interaction === "board" ? boardPlayable(view) : [];
  const youOpts: SideRenderOpts = {
    playable,
    selected: botTurn ? null : ui.selected,
    targets: botTurn ? [] : ui.targets,
    playerIndex: 0,
    interactive: !botTurn && view.interaction === "board",
  };
  const oppOpts: SideRenderOpts = {
    playable,
    selected: botTurn ? null : ui.selected,
    targets: botTurn ? [] : ui.targets,
    playerIndex: 1,
    interactive: false,
  };
  const endTurn = botTurn ? null : endTurnOption(view);
  const banner =
    view.phase === "over" && view.resultText
      ? resultScreenHtml(view.resultText, resultOutcome(view.resultText))
      : "";
  const botBanner = botTurn
    ? `<div class="ptcg-bot-banner" role="status"><span>상대 턴</span><button type="button" data-skip-bot>건너뛰기</button></div>`
    : "";
  const log = view.log.map((line) => `<li>${esc(line)}</li>`).join("");
  const stadiumSpot = { playerIndex: 0, area: 7, index: 0 };
  const stadiumFlash = flashClass(highlights, "table", "stadium");
  const stadium = view.stadium
    ? `<div class="ptcg-stadium${stadiumFlash}"><span class="ptcg-zone-label">스타디움</span><div class="ptcg-cards">${cardHtml(view.stadium, {
        caption: true,
        spot: stadiumSpot,
        playable,
        selected: youOpts.selected,
        targets: youOpts.targets,
      })}</div></div>`
    : `<div class="ptcg-stadium ptcg-stadium--empty${stadiumFlash}" aria-hidden="true"><span class="ptcg-zone-label">스타디움</span></div>`;
  const myHand = view.you.hand ? fanHand(view.you.hand, youOpts) : `<p class="ptcg-count">패 ${view.you.handCount}</p>`;
  const endTurnBtn = endTurn
    ? `<button type="button" class="ptcg-hud-end" data-option="${endTurn.index}">턴 종료</button>`
    : `<button type="button" class="ptcg-hud-end" disabled>턴 종료</button>`;
  const actions =
    view.phase === "over"
      ? `<p class="ptcg-actions"><button type="button" data-restart>다시 하기</button> <button type="button" data-decks>덱 고르기</button></p>`
      : "";
  const handMenu =
    !botTurn && ui.sheet === "hand" && ui.selected
      ? handActionMenuHtml(
          view.options.filter(
            (option) =>
              option.source &&
              option.source.area === ui.selected!.area &&
              option.source.index === ui.selected!.index &&
              option.source.playerIndex === ui.selected!.playerIndex &&
              (option.kind === "play" || option.kind === "attach" || option.kind === "evolve"),
          ),
        )
      : "";
  const attackSheet = !botTurn && ui.sheet === "attack" ? attackSheetHtml(view) : "";
  const picker = !botTurn && view.interaction === "picker" ? pickerHtml(view) : "";
  const quick =
    !botTurn && (view.interaction === "board" || view.interaction === "buttons") ? quickActionsHtml(view) : "";
  const fallback = botTurn
    ? ""
    : fallbackOptionsHtml(
        {
          ...view,
          options: view.options.filter((option) => !endTurn || option.index !== endTurn.index),
        },
        optionHtml,
      );
  const prompt = botTurn ? "상대가 두는 중" : note || view.prompt;
  const who = botTurn ? "상대 턴" : turnOwnerLabel(view);
  const logDrawer = botTurn
    ? ""
    : `<aside id="ptcg-log-drawer" class="ptcg-log-drawer" data-log-drawer hidden>
      <div class="ptcg-log-drawer-head">
        <h2 class="ptcg-log-title">기록</h2>
        <button type="button" class="ptcg-log-close" data-log-close>닫기</button>
      </div>
      <ol class="ptcg-log">${log}</ol>
    </aside>`;

  return `<div class="ptcg-battle" data-battle>
    <div class="ptcg-battle-hud" role="toolbar" aria-label="대전 정보">
      <button type="button" class="ptcg-hud-exit" data-exit>나가기</button>
      <div class="ptcg-hud-meta">
        <span class="ptcg-hud-turn">턴 ${view.turn}</span>
        <span class="ptcg-hud-who">${esc(who)}</span>
        <span class="ptcg-hud-prizes">프라이즈 나 ${view.you.prizeCount} / 상대 ${view.opp.prizeCount}</span>
      </div>
      ${endTurnBtn}
      <button type="button" class="ptcg-hud-log" data-log-open aria-expanded="false" aria-controls="ptcg-log-drawer" ${botTurn ? "disabled" : ""}>기록</button>
    </div>
    ${banner}${botBanner}
    <div class="ptcg-battle-stage">
      <div class="ptcg-battle-board">
        <div class="ptcg-table">
          ${sideHtml("상대", view.opp, "opp", oppOpts, highlights)}
          ${stadium}
          ${sideHtml("나", view.you, "you", youOpts, highlights)}
        </div>
        <div class="ptcg-zone ptcg-zone--hand ptcg-zone--my-hand${flashClass(highlights, "you", "hand")}"><span class="ptcg-zone-label">패</span>${myHand}</div>
      </div>
    </div>
    <div class="ptcg-controls ptcg-battle-controls">
      <div class="ptcg-fx-toolbar">${muteToggleHtml(muted)}</div>
      <p class="ptcg-prompt" role="status">${esc(prompt)}</p>
      ${quick}
      ${handMenu}
      ${attackSheet}
      ${picker}
      ${fallback}
      ${actions}
    </div>
    ${logDrawer}
    <dialog class="ptcg-pile-sheet" data-pile-sheet aria-label="카드 더미">
      <div class="ptcg-pile-sheet-head">
        <h2 class="ptcg-pile-sheet-title" data-pile-sheet-title>더미</h2>
        <button type="button" class="ptcg-pile-sheet-close" data-pile-sheet-close>닫기</button>
      </div>
      <div class="ptcg-pile-sheet-body" data-pile-sheet-body></div>
    </dialog>
  </div>`;
}

export function boardHtml(
  view: GameView,
  note = "",
  paintOrUi: BoardPaintOptions | ViewUiState = EMPTY_UI,
  muted = true,
): string {
  if (isViewUiState(paintOrUi)) {
    return battleBoardHtml(view, note, paintOrUi, muted);
  }
  return battleBoardHtml(
    view,
    paintOrUi.note || note,
    paintOrUi.ui || EMPTY_UI,
    paintOrUi.muted ?? muted,
    Boolean(paintOrUi.botTurn),
    paintOrUi.highlights || [],
  );
}

export function setBattleChrome(active: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("ptcg-battle-active", active);
  document.documentElement.classList.toggle("ptcg-battle-active", active);
}

export function openLogDrawer(root: Element): void {
  const drawer = root.querySelector("[data-log-drawer]");
  if (!(drawer instanceof HTMLElement)) return;
  drawer.hidden = false;
  root.querySelector("[data-log-open]")?.setAttribute("aria-expanded", "true");
  const log = drawer.querySelector(".ptcg-log");
  if (log) log.scrollTop = log.scrollHeight;
}

export function closeLogDrawer(root: Element): void {
  const drawer = root.querySelector("[data-log-drawer]");
  if (!(drawer instanceof HTMLElement)) return;
  drawer.hidden = true;
  root.querySelector("[data-log-open]")?.setAttribute("aria-expanded", "false");
}

export function openPileSheet(root: Element, pileId: string): void {
  const source = root.querySelector(`template[data-pile-body="${pileId}"]`);
  const sheet = root.querySelector("[data-pile-sheet]");
  if (!(source instanceof HTMLTemplateElement) || !(sheet instanceof HTMLDialogElement)) return;
  const title = source.getAttribute("data-pile-title") || "더미";
  const titleEl = sheet.querySelector("[data-pile-sheet-title]");
  const bodyEl = sheet.querySelector("[data-pile-sheet-body]");
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) {
    bodyEl.innerHTML = "";
    bodyEl.append(source.content.cloneNode(true));
  }
  if (typeof sheet.showModal === "function" && !sheet.open) sheet.showModal();
}

export function closePileSheet(root: Element): void {
  const sheet = root.querySelector("[data-pile-sheet]");
  if (sheet instanceof HTMLDialogElement && sheet.open) sheet.close();
}

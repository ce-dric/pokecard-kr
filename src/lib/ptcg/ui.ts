import { findDropOption, handActions, targetsFor, type CardSpot } from "./actions.ts";
import { playCardHtml } from "./board-card.ts";
import { decks } from "./decks.ts";
import {
  attackSheetHtml,
  boardPlayable,
  fallbackOptionsHtml,
  handActionMenuHtml,
  highlightClass,
  mappedFromView,
  parseSpot,
  pickerHtml,
  quickActionsHtml,
  spotKey,
} from "./interact-ui.ts";
import type { FaceCard, GameView } from "./view.ts";

interface WorkerIn {
  type: "start" | "restart" | "choose";
  engineUrl?: string;
  deck0?: number[];
  deck1?: number[];
  indices?: number[];
}

interface WorkerOut {
  type: "view" | "error";
  view?: GameView;
  message?: string;
}

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

interface Control {
  tagName: string;
  closest(selector: string): Control | null;
  getAttribute(name: string): string | null;
}

function asControl(target: unknown): Control | null {
  if (!target || typeof target !== "object") return null;
  if (!("tagName" in target) || typeof target.tagName !== "string") return null;
  if (!("closest" in target) || typeof target.closest !== "function") return null;
  if (!("getAttribute" in target) || typeof target.getAttribute !== "function") return null;
  return target as Control;
}

function closestButton(target: Control, selector: string): Control | null {
  const node = target.closest(selector);
  if (!node || node.tagName.toLowerCase() !== "button") return null;
  return node;
}

export type BoardAction =
  | { type: "zoom"; full: string; alt: string }
  | { type: "option"; index: number }
  | { type: "close" };

export function actionFromPointer(event: { target: unknown; stopPropagation(): void }): BoardAction | null {
  const target = asControl(event.target);
  if (!target) return null;
  const zoom = closestButton(target, "[data-zoom-open]");
  if (zoom) {
    event.stopPropagation();
    return {
      type: "zoom",
      full: zoom.getAttribute("data-full") || "",
      alt: zoom.getAttribute("data-alt") || "",
    };
  }
  const option = closestButton(target, "[data-option]");
  if (!option) return null;
  const index = Number(option.getAttribute("data-option"));
  if (!Number.isInteger(index)) return null;
  return { type: "option", index };
}

export function actionFromKey(event: {
  key: string;
  target: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}): BoardAction | null {
  if (event.key === "Escape") return { type: "close" };
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return null;
  const target = asControl(event.target);
  if (!target) return null;
  const zoom = closestButton(target, "[data-zoom-open]");
  if (!zoom) return null;
  const full = zoom.getAttribute("data-full") || "";
  if (!full) return null;
  event.preventDefault();
  event.stopPropagation();
  return { type: "zoom", full, alt: zoom.getAttribute("data-alt") || "" };
}

function zoomButton(src: string, full: string, label: string, width: number, height: number): string {
  return `<button type="button" class="ptcg-zoom-image" data-zoom-open data-full="${esc(full)}" data-alt="${label}" aria-label="${label} 확대"><img src="${esc(src)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" /></button>`;
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
  // Keep data-zoom-open so long-press / right-click can enlarge; short click acts when data-card-act is set.
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

function benchSlots(cards: FaceCard[], opts: SideRenderOpts): string {
  return Array.from({ length: 5 }, (_, index) => {
    const spot = { playerIndex: opts.playerIndex, area: 5, index };
    const card = cards[index];
    return card ? playSpotHtml(card, false, spot, opts) : emptySlot("빈자리", spot, opts.targets);
  }).join("");
}

function sideHtml(
  title: string,
  side: GameView["you"],
  showHand: boolean,
  role: "you" | "opp",
  opts: SideRenderOpts,
): string {
  const hand =
    showHand && side.hand
      ? side.hand
          .map((card, index) => {
            const spot = { playerIndex: opts.playerIndex, area: 2, index };
            const canDrag =
              opts.interactive &&
              opts.playable.some((row) => row.area === 2 && row.index === index && row.playerIndex === opts.playerIndex);
            return cardHtml(card, {
              caption: false,
              spot,
              playable: opts.playable,
              selected: opts.selected,
              targets: opts.targets,
              draggable: canDrag,
            });
          })
          .join("")
      : `<p class="ptcg-count">패 ${side.handCount}</p>`;
  const discard =
    side.discard
      .map((card, index) =>
        cardHtml(card, {
          caption: false,
          spot: { playerIndex: opts.playerIndex, area: 3, index },
          playable: opts.playable,
          selected: opts.selected,
          targets: opts.targets,
        }),
      )
      .join("") || `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`;
  const active =
    side.active
      .map((card, index) =>
        playSpotHtml(card, true, { playerIndex: opts.playerIndex, area: 4, index }, opts),
      )
      .join("") || `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`;
  return `<section class="ptcg-playmat ptcg-playmat--${role}" aria-label="${esc(title)}">
    <header class="ptcg-playmat-head"><h2>${esc(title)}</h2></header>
    <div class="ptcg-zone ptcg-zone--prizes"><span class="ptcg-zone-label">프라이즈</span>${prizeGrid(side.prizeCount)}</div>
    <div class="ptcg-zone ptcg-zone--bench"><span class="ptcg-zone-label">벤치</span><div class="ptcg-cards ptcg-bench">${benchSlots(side.bench, opts)}</div></div>
    <div class="ptcg-zone ptcg-zone--deck"><span class="ptcg-zone-label">덱</span><div class="ptcg-cards"><div class="ptcg-card"><div class="ptcg-back" aria-label="덱 ${side.deckCount}"><span class="ptcg-stack-count">${side.deckCount}</span></div></div></div></div>
    <div class="ptcg-zone ptcg-zone--active"><span class="ptcg-zone-label">배틀필드</span><div class="ptcg-cards">${active}</div></div>
    <div class="ptcg-zone ptcg-zone--trash"><span class="ptcg-zone-label">트래쉬</span><div class="ptcg-cards">${discard}</div></div>
    <div class="ptcg-zone ptcg-zone--hand"><span class="ptcg-zone-label">패</span><div class="ptcg-cards ptcg-hand">${hand}</div></div>
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

interface ViewUiState {
  selected: CardSpot | null;
  targets: CardSpot[];
  sheet: "none" | "hand" | "attack";
}

const EMPTY_UI: ViewUiState = { selected: null, targets: [], sheet: "none" };

function viewHtml(view: GameView, note: string, ui: ViewUiState = EMPTY_UI): string {
  const playable = view.interaction === "board" ? boardPlayable(view) : [];
  const youOpts = {
    playable,
    selected: ui.selected,
    targets: ui.targets,
    playerIndex: 0,
    interactive: view.interaction === "board",
  };
  const oppOpts = {
    playable,
    selected: ui.selected,
    targets: ui.targets,
    playerIndex: 1,
    interactive: false,
  };
  const banner = view.resultText ? `<p class="ptcg-result" role="status">${esc(view.resultText)}</p>` : "";
  const log = view.log.map((line) => `<li>${esc(line)}</li>`).join("");
  const stadiumSpot = { playerIndex: 0, area: 7, index: 0 };
  const stadium = view.stadium
    ? `<div class="ptcg-stadium"><span class="ptcg-zone-label">스타디움</span><div class="ptcg-cards">${cardHtml(view.stadium, {
        caption: true,
        spot: stadiumSpot,
        playable,
        selected: ui.selected,
        targets: ui.targets,
      })}</div></div>`
    : "";
  const handMenu =
    ui.sheet === "hand" && ui.selected
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
  const attackSheet = ui.sheet === "attack" ? attackSheetHtml(view) : "";
  const picker = view.interaction === "picker" ? pickerHtml(view) : "";
  const quick = view.interaction === "board" || view.interaction === "buttons" ? quickActionsHtml(view) : "";
  return `${banner}
    <div class="ptcg-controls">
      <p class="ptcg-prompt" role="status">${esc(note || view.prompt)}</p>
      <p class="ptcg-turn">턴 ${view.turn}</p>
      ${quick}
      ${handMenu}
      ${attackSheet}
      ${picker}
      ${fallbackOptionsHtml(view, optionHtml)}
    </div>
    <div class="ptcg-table">
      ${sideHtml("상대", view.opp, false, "opp", oppOpts)}
      ${stadium}
      ${sideHtml("나", view.you, true, "you", youOpts)}
    </div>
    <details class="ptcg-log-panel" open>
      <summary class="ptcg-log-title">기록</summary>
      <ol class="ptcg-log">${log}</ol>
    </details>`;
}

export function boardHtml(view: GameView, note = "", ui: ViewUiState = EMPTY_UI): string {
  return viewHtml(view, note, ui);
}

export function mountGame(root: Element | null): void {
  if (!root) return;
  let worker: Worker | null = null;
  let mine = decks[0]?.id ?? "sample";
  let theirs = decks[1]?.id ?? decks[0]?.id ?? "sample";
  let picked = new Set<number>();
  let latest: GameView | null = null;
  let busy = false;
  let uiState: ViewUiState = { ...EMPTY_UI };
  let dragSource: CardSpot | null = null;
  let noteText = "";

  const engineUrl = (): string => {
    const base = import.meta.env.BASE_URL || "/";
    return new URL("game/ptcg.mjs", window.location.origin + base).href;
  };

  const deckButtons = (group: "mine" | "theirs", current: string): string =>
    decks
      .map((deck) => {
        const pressed = deck.id === current ? "true" : "false";
        return `<button type="button" data-deck="${group}" data-id="${esc(deck.id)}" aria-pressed="${pressed}">${esc(deck.titleKo)} <small>${esc(deck.faceEn)}</small></button>`;
      })
      .join("");

  const paintLobby = (): void => {
    root.innerHTML = `<div class="ptcg-setup">
      <fieldset><legend>내 덱</legend><div class="ptcg-choices">${deckButtons("mine", mine)}</div></fieldset>
      <fieldset><legend>상대 덱</legend><div class="ptcg-choices">${deckButtons("theirs", theirs)}</div></fieldset>
      <p class="ptcg-note">샘플 덱은 공식 스탠다드 레귤레이션(마크 H, I, J)을 따릅니다. 규정은 <a href="https://pokemoncard.co.kr/card/play_qna" rel="noopener noreferrer">포켓몬 카드 게임 공식 플레이 안내</a>를 보세요. 한국판 목록에 확인된 카드는 우리 이름과 이미지를 쓰고, 아직 없는 카드는 영문 이름과 일본 공식 이미지를 씁니다.</p>
      <button type="button" data-start>대전 시작</button>
    </div><div data-board hidden></div>`;
  };

  const syncPressed = (): void => {
    for (const button of root.querySelectorAll("[data-option]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      const index = Number(button.getAttribute("data-option"));
      button.setAttribute("aria-pressed", picked.has(index) ? "true" : "false");
    }
    const confirm = root.querySelector("[data-confirm]");
    if (confirm instanceof HTMLButtonElement && latest) {
      const ready = picked.size >= latest.minCount && picked.size <= latest.maxCount;
      confirm.disabled = !ready;
      confirm.textContent = picked.size === 0 && latest.minCount === 0 ? "넘기기" : "결정";
    }
  };

  const paintBoard = (view: GameView, note = ""): void => {
    const board = root.querySelector("[data-board]");
    if (!board) return;
    noteText = note;
    root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
    board.removeAttribute("hidden");
    board.innerHTML = `${viewHtml(view, note, uiState)}<p class="ptcg-actions"><button type="button" data-restart>다시 하기</button> <button type="button" data-decks>덱 고르기</button></p>`;
    const log = board.querySelector(".ptcg-log");
    if (log) log.scrollTop = log.scrollHeight;
    syncPressed();
    board.scrollIntoView({ block: "start" });
  };

  const choose = (indices: number[]): void => {
    if (busy || !latest) return;
    busy = true;
    uiState = { ...EMPTY_UI };
    ensureWorker().postMessage({ type: "choose", indices } satisfies WorkerIn);
  };

  const clearUi = (): void => {
    uiState = { ...EMPTY_UI };
    if (latest) paintBoard(latest, noteText);
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      busy = false;
      const data = event.data;
      if (data.type === "error") {
        const board = root.querySelector("[data-board]");
        if (board) {
          root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
          board.removeAttribute("hidden");
          board.innerHTML = `<p class="ptcg-result" role="status">${esc(data.message || "대전을 진행하지 못했습니다")}</p><p class="ptcg-actions"><button type="button" data-restart>다시 하기</button> <button type="button" data-decks>덱 고르기</button></p>`;
        }
        return;
      }
      if (data.view) {
        latest = data.view;
        picked = new Set();
        uiState = { ...EMPTY_UI };
        dragSource = null;
        paintBoard(data.view, data.message || "");
      }
    };
    worker.onerror = () => {
      busy = false;
      const board = root.querySelector("[data-board]");
      if (board) {
        board.removeAttribute("hidden");
        board.innerHTML = `<p class="ptcg-result" role="status">엔진을 읽지 못했습니다</p>`;
      }
    };
    return worker;
  };

  const start = (): void => {
    const deck0 = decks.find((deck) => deck.id === mine);
    const deck1 = decks.find((deck) => deck.id === theirs);
    if (!deck0 || !deck1) return;
    busy = true;
    const board = root.querySelector("[data-board]");
    root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
    if (board) {
      board.removeAttribute("hidden");
      board.innerHTML = `<p class="ptcg-prompt" role="status">엔진을 읽고 있습니다</p>`;
      board.scrollIntoView({ block: "start" });
    }
    ensureWorker().postMessage({
      type: latest ? "restart" : "start",
      engineUrl: engineUrl(),
      deck0: deck0.cards,
      deck1: deck1.cards,
    } satisfies WorkerIn);
  };

  const openZoom = (full: string, alt: string): void => {
    if (!full) return;
    let dialog = root.querySelector("[data-zoom]");
    if (!(dialog instanceof HTMLDialogElement)) {
      root.insertAdjacentHTML(
        "beforeend",
        `<dialog class="ptcg-zoom" data-zoom aria-label="카드 확대">
          <button type="button" data-zoom-close>닫기</button>
          <img data-zoom-image alt="" width="480" height="670" tabindex="-1" decoding="async" />
          <p class="caption">이미지 출처: 포켓몬 공식</p>
        </dialog>`,
      );
      dialog = root.querySelector("[data-zoom]");
      if (!(dialog instanceof HTMLDialogElement)) return;
      dialog.querySelector("[data-zoom-close]")?.addEventListener("click", () => dialog?.close());
      dialog.addEventListener("click", (click) => {
        if (click.target === dialog) dialog.close();
      });
    }
    const image = dialog.querySelector("[data-zoom-image]");
    if (image instanceof HTMLImageElement) {
      image.src = full;
      image.alt = alt;
      image.tabIndex = -1;
    }
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    if (image instanceof HTMLImageElement) image.focus();
  };

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  const clearPress = (): void => {
    if (pressTimer != null) clearTimeout(pressTimer);
    pressTimer = null;
  };

  root.addEventListener("keydown", (event) => {
    const action = actionFromKey(event);
    if (action?.type === "close") {
      const dialog = root.querySelector("[data-zoom]");
      if (dialog instanceof HTMLDialogElement && dialog.open) {
        dialog.close();
        return;
      }
      if (uiState.sheet !== "none") {
        clearUi();
        return;
      }
      return;
    }
    const keyTarget = event.target;
    const acting =
      keyTarget instanceof Element ? keyTarget.closest("[data-card-act]") : null;
    if (action?.type === "zoom" && !(acting instanceof HTMLElement)) {
      openZoom(action.full, action.alt);
      return;
    }
    if (busy || !latest || latest.phase !== "choose") return;
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    if (!(acting instanceof HTMLElement)) return;
    event.preventDefault();
    activateCard(parseSpot(acting.getAttribute("data-spot")));
  });

  const activateCard = (spot: CardSpot | null): void => {
    if (!spot || !latest || latest.interaction !== "board") return;
    const mapped = mappedFromView(latest);

    if (uiState.targets.length && uiState.selected) {
      const hit = uiState.targets.find((row) => row.area === spot.area && row.index === spot.index && row.playerIndex === spot.playerIndex);
      if (hit) {
        const option = findDropOption(mapped, uiState.selected, hit);
        if (option) {
          choose([option.optionIndex]);
          return;
        }
      }
    }

    if (spot.area === 2 && spot.playerIndex === 0) {
      const actions = handActions(mapped, spot.index, 0);
      if (!actions.length) return;
      if (actions.length === 1 && actions[0].kind === "play") {
        choose([actions[0].optionIndex]);
        return;
      }
      const onlyAttach = actions.length > 0 && actions.every((row) => row.kind === "attach");
      const onlyEvolve = actions.length > 0 && actions.every((row) => row.kind === "evolve");
      if (onlyAttach || onlyEvolve) {
        uiState = {
          selected: spot,
          targets: actions.map((row) => row.target!).filter(Boolean),
          sheet: "none",
        };
        paintBoard(latest, noteText);
        return;
      }
      uiState = { selected: spot, targets: [], sheet: "hand" };
      paintBoard(latest, noteText);
      return;
    }

    if (spot.area === 4 && spot.playerIndex === 0 && spot.index === 0) {
      const hasSheet = latest.options.some(
        (option) => option.kind === "attack" || option.kind === "retreat" || (option.kind === "ability" && option.source?.area === 4),
      );
      if (!hasSheet) return;
      uiState = { selected: spot, targets: [], sheet: "attack" };
      paintBoard(latest, noteText);
      return;
    }

    if (spot.area === 4 || spot.area === 5 || spot.area === 7) {
      const ability = latest.options.find(
        (option) =>
          option.kind === "ability" &&
          option.source &&
          option.source.area === spot.area &&
          option.source.index === spot.index &&
          option.source.playerIndex === spot.playerIndex,
      );
      if (ability) choose([ability.index]);
    }
  };

  root.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !latest || latest.interaction !== "board") return;
    const card = target.closest("[data-card-act][draggable='true']");
    if (!(card instanceof HTMLElement)) return;
    dragSource = parseSpot(card.getAttribute("data-spot"));
    event.dataTransfer?.setData("text/plain", card.getAttribute("data-spot") || "");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  root.addEventListener("dragover", (event) => {
    if (!dragSource || !latest) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest("[data-spot]");
    if (!(card instanceof HTMLElement)) return;
    const spot = parseSpot(card.getAttribute("data-spot"));
    if (!spot) return;
    if (!findDropOption(mappedFromView(latest), dragSource, spot)) return;
    event.preventDefault();
  });

  root.addEventListener("drop", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !latest || !dragSource) return;
    const card = target.closest("[data-spot]");
    if (!(card instanceof HTMLElement)) return;
    const spot = parseSpot(card.getAttribute("data-spot"));
    if (!spot) return;
    const option = findDropOption(mappedFromView(latest), dragSource, spot);
    dragSource = null;
    if (!option) return;
    event.preventDefault();
    choose([option.optionIndex]);
  });

  root.addEventListener("dragend", () => {
    dragSource = null;
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = asControl(event.target);
    if (!target) return;
    const zoom = closestButton(target, "[data-zoom-open]");
    if (!zoom) return;
    longPressed = false;
    clearPress();
    pressTimer = setTimeout(() => {
      longPressed = true;
      openZoom(zoom.getAttribute("data-full") || "", zoom.getAttribute("data-alt") || "");
    }, 450);
  });
  root.addEventListener("pointerup", clearPress);
  root.addEventListener("pointercancel", clearPress);
  root.addEventListener("pointerleave", clearPress);
  root.addEventListener("contextmenu", (event) => {
    const action = actionFromPointer(event);
    if (action?.type !== "zoom") return;
    event.preventDefault();
    openZoom(action.full, action.alt);
  });

  root.addEventListener("click", (event) => {
    if (longPressed) {
      longPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const action = actionFromPointer(event);
    const target = event.target;
    if (!(target instanceof Element)) return;
    const acting = target.closest("[data-card-act]");
    if (acting instanceof HTMLElement && action?.type === "zoom") {
      activateCard(parseSpot(acting.getAttribute("data-spot")));
      return;
    }
    if (action?.type === "zoom") {
      openZoom(action.full, action.alt);
      return;
    }
    const deckButton = target.closest("[data-deck]");
    if (deckButton instanceof HTMLButtonElement) {
      const group = deckButton.dataset.deck;
      const id = deckButton.dataset.id;
      if (!id) return;
      if (group === "mine") mine = id;
      if (group === "theirs") theirs = id;
      for (const button of root.querySelectorAll(`[data-deck="${group}"]`)) {
        button.setAttribute("aria-pressed", button.getAttribute("data-id") === id ? "true" : "false");
      }
      return;
    }
    if (target.closest("[data-start]") || target.closest("[data-restart]")) {
      start();
      return;
    }
    if (target.closest("[data-decks]")) {
      root.querySelector(".ptcg-setup")?.removeAttribute("hidden");
      root.querySelector(".ptcg-setup")?.scrollIntoView({ block: "start" });
      return;
    }
    if (target.closest("[data-clear-selection]")) {
      clearUi();
      return;
    }
    if (busy || !latest || latest.phase !== "choose") return;

    const intent = target.closest("[data-hand-intent]");
    if (intent instanceof HTMLButtonElement && latest) {
      const kind = intent.getAttribute("data-hand-intent");
      const handIndex = Number(intent.getAttribute("data-hand-index"));
      if ((kind === "attach" || kind === "evolve") && Number.isInteger(handIndex)) {
        const rows = targetsFor(mappedFromView(latest), kind, handIndex, 0);
        uiState = {
          selected: { playerIndex: 0, area: 2, index: handIndex },
          targets: rows.map((row) => row.target!).filter(Boolean),
          sheet: "none",
        };
        paintBoard(latest, noteText);
      }
      return;
    }

    if (action?.type === "option") {
      const index = action.index;
      const optionButton = target.closest("[data-option]");
      if (!(optionButton instanceof HTMLButtonElement)) return;
      if (latest.maxCount === 1 && latest.minCount >= 1) {
        choose([index]);
        return;
      }
      if (picked.has(index)) picked.delete(index);
      else if (picked.size < latest.maxCount) picked.add(index);
      syncPressed();
      return;
    }
    if (target.closest("[data-confirm]")) {
      if (picked.size < (latest.minCount || 0) || picked.size > latest.maxCount) return;
      choose([...picked]);
      return;
    }

    const card = target.closest("[data-card-act]");
    if (card instanceof HTMLElement) {
      activateCard(parseSpot(card.getAttribute("data-spot")));
      return;
    }
    if (uiState.targets.length) {
      const drop = target.closest("[data-spot]");
      if (drop instanceof HTMLElement) activateCard(parseSpot(drop.getAttribute("data-spot")));
    }
  });

  paintLobby();
}

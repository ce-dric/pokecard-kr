import { decks } from "./decks.ts";
import { insertTutorialLobbyControls, mountTutorial } from "./tutorial-ui.ts";
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

function cardHtml(card: FaceCard, caption: boolean): string {
  if (card.hidden) return `<div class="ptcg-card"><div class="ptcg-back" aria-label="뒷면"></div></div>`;
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
  const meta = caption ? `<span class="ptcg-caption">${name}${hp ? ` ${esc(hp)}` : ""}</span>${energies ? `<span class="ptcg-energies">${energies}</span>` : ""}` : "";
  return `<div class="ptcg-card">${body}${meta}</div>`;
}

function emptySlot(label: string): string {
  return `<div class="ptcg-card"><div class="ptcg-empty ptcg-slot" aria-label="${esc(label)}">${esc(label)}</div></div>`;
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

function benchSlots(cards: FaceCard[]): string {
  return Array.from({ length: 5 }, (_, index) => {
    const card = cards[index];
    return card ? cardHtml(card, true) : emptySlot("빈자리");
  }).join("");
}

function sideHtml(title: string, side: GameView["you"], showHand: boolean, role: "you" | "opp"): string {
  const status = side.conditions.length ? side.conditions.join(" ") : "";
  const hand =
    showHand && side.hand
      ? side.hand.map((card) => cardHtml(card, false)).join("")
      : `<p class="ptcg-count">패 ${side.handCount}</p>`;
  const discard =
    side.discard.map((card) => cardHtml(card, false)).join("") ||
    `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`;
  const active =
    side.active.map((card) => cardHtml(card, true)).join("") ||
    `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`;
  return `<section class="ptcg-playmat ptcg-playmat--${role}" aria-label="${esc(title)}" data-tutorial-target="${role}-playmat" data-tutorial-zone tabindex="-1">
    <header class="ptcg-playmat-head"><h2>${esc(title)}</h2>${status ? `<p class="ptcg-status">${esc(status)}</p>` : ""}</header>
    <div class="ptcg-zone ptcg-zone--prizes" data-tutorial-target="${role}-prize" data-tutorial-zone tabindex="-1"><span class="ptcg-zone-label">프라이즈</span>${prizeGrid(side.prizeCount)}</div>
    <div class="ptcg-zone ptcg-zone--bench" data-tutorial-target="${role}-bench" data-tutorial-zone tabindex="-1"><span class="ptcg-zone-label">벤치</span><div class="ptcg-cards ptcg-bench">${benchSlots(side.bench)}</div></div>
    <div class="ptcg-zone ptcg-zone--deck" data-tutorial-target="${role}-deck" data-tutorial-zone tabindex="-1"><span class="ptcg-zone-label">덱</span><div class="ptcg-cards"><div class="ptcg-card"><div class="ptcg-back" aria-label="덱 ${side.deckCount}"><span class="ptcg-stack-count">${side.deckCount}</span></div></div></div></div>
    <div class="ptcg-zone ptcg-zone--active" data-tutorial-target="${role}-active" data-tutorial-zone tabindex="-1"><span class="ptcg-zone-label">배틀필드</span><div class="ptcg-cards">${active}</div></div>
    <div class="ptcg-zone ptcg-zone--trash" data-tutorial-target="${role}-discard" data-tutorial-zone tabindex="-1"><span class="ptcg-zone-label">트래쉬</span><div class="ptcg-cards">${discard}</div></div>
    <div class="ptcg-zone ptcg-zone--hand" data-tutorial-target="${role}-hand" data-tutorial-zone tabindex="-1"><span class="ptcg-zone-label">패</span><div class="ptcg-cards ptcg-hand">${hand}</div></div>
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

function viewHtml(view: GameView, note: string): string {
  const options = view.options.map((option) => optionHtml(option)).join("");
  const multi = view.phase === "choose" && view.maxCount >= 1 && !(view.maxCount === 1 && view.minCount >= 1);
  const confirm = multi
    ? `<button type="button" data-confirm${view.minCount > 0 ? " disabled" : ""}>${view.minCount === 0 ? "넘기기" : "결정"}</button>`
    : "";
  const banner = view.resultText ? `<p class="ptcg-result" role="status">${esc(view.resultText)}</p>` : "";
  const log = view.log.map((line) => `<li>${esc(line)}</li>`).join("");
  const stadium = view.stadium
    ? `<div class="ptcg-stadium"><span class="ptcg-zone-label">스타디움</span><div class="ptcg-cards">${cardHtml(view.stadium, true)}</div></div>`
    : "";
  return `${banner}
    <div class="ptcg-controls">
      <p class="ptcg-prompt" role="status">${esc(note || view.prompt)}</p>
      <p class="ptcg-turn">턴 ${view.turn}</p>
      <div class="ptcg-options" role="group" aria-label="선택">${options}${confirm}</div>
    </div>
    <div class="ptcg-table">
      ${sideHtml("상대", view.opp, false, "opp")}
      ${stadium}
      ${sideHtml("나", view.you, true, "you")}
    </div>
    <details class="ptcg-log-panel" open>
      <summary class="ptcg-log-title">기록</summary>
      <ol class="ptcg-log">${log}</ol>
    </details>`;
}

export function boardHtml(view: GameView, note = ""): string {
  return viewHtml(view, note);
}

export function mountGame(root: Element | null): void {
  if (!root) return;
  let worker: Worker | null = null;
  let mine = decks[0]?.id ?? "sample";
  let theirs = decks[1]?.id ?? decks[0]?.id ?? "sample";
  let picked = new Set<number>();
  let latest: GameView | null = null;
  let busy = false;

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
    const setup = root.querySelector(".ptcg-setup");
    if (setup) insertTutorialLobbyControls(setup);
  };

  const paintBoard = (view: GameView, note = ""): void => {
    const board = root.querySelector("[data-board]");
    if (!board) return;
    root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
    board.removeAttribute("hidden");
    board.innerHTML = `${viewHtml(view, note)}<p class="ptcg-actions"><button type="button" data-restart>다시 하기</button> <button type="button" data-decks>덱 고르기</button></p>`;
    const log = board.querySelector(".ptcg-log");
    if (log) log.scrollTop = log.scrollHeight;
    board.scrollIntoView({ block: "start" });
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

  const tutorial = mountTutorial(root, {
    renderBoard(view) {
      paintBoard(view);
    },
    showLobby() {
      paintLobby();
      root.querySelector("[data-board]")?.setAttribute("hidden", "");
    },
  });

  root.addEventListener("keydown", (event) => {
    if (tutorial.isActive()) return;
    const action = actionFromKey(event);
    if (action?.type === "close") {
      const dialog = root.querySelector("[data-zoom]");
      if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
      return;
    }
    if (action?.type === "zoom") openZoom(action.full, action.alt);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-tutorial-start]")) {
      tutorial.start();
      return;
    }
    if (tutorial.isActive()) return;
    const action = actionFromPointer(event);
    if (action?.type === "zoom") {
      openZoom(action.full, action.alt);
      return;
    }
    if (!(target instanceof Element)) return;
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
    if (busy || !latest || latest.phase !== "choose") return;
    if (action?.type === "option") {
      const index = action.index;
      const optionButton = target.closest("[data-option]");
      if (!(optionButton instanceof HTMLButtonElement)) return;
      if (latest.maxCount === 1 && latest.minCount >= 1) {
        busy = true;
        ensureWorker().postMessage({ type: "choose", indices: [index] } satisfies WorkerIn);
        return;
      }
      if (picked.has(index)) picked.delete(index);
      else if (picked.size < latest.maxCount) picked.add(index);
      optionButton.setAttribute("aria-pressed", picked.has(index) ? "true" : "false");
      const confirm = root.querySelector("[data-confirm]");
      if (confirm instanceof HTMLButtonElement) {
        const ready = picked.size >= latest.minCount && picked.size <= latest.maxCount;
        confirm.disabled = !ready;
        confirm.textContent = picked.size === 0 && latest.minCount === 0 ? "넘기기" : "결정";
      }
      return;
    }
    if (target.closest("[data-confirm]")) {
      if (picked.size < (latest.minCount || 0) || picked.size > latest.maxCount) return;
      busy = true;
      ensureWorker().postMessage({ type: "choose", indices: [...picked] } satisfies WorkerIn);
    }
  });

  paintLobby();

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tutorial") === "1") tutorial.start();
  }
}

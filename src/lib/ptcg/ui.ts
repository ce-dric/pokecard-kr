import {
  boardHtml,
  closeLogDrawer,
  closePileSheet,
  openLogDrawer,
  openPileSheet,
  setBattleChrome,
} from "./battle-board.ts";
import { decks } from "./decks.ts";
import type { GameView } from "./view.ts";

export { boardHtml } from "./battle-board.ts";

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

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
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

  const showLobby = (): void => {
    setBattleChrome(false);
    root.querySelector(".ptcg-setup")?.removeAttribute("hidden");
    const board = root.querySelector("[data-board]");
    if (board) {
      board.setAttribute("hidden", "");
      board.innerHTML = "";
    }
  };

  const paintLobby = (): void => {
    setBattleChrome(false);
    root.innerHTML = `<div class="ptcg-setup">
      <fieldset><legend>내 덱</legend><div class="ptcg-choices">${deckButtons("mine", mine)}</div></fieldset>
      <fieldset><legend>상대 덱</legend><div class="ptcg-choices">${deckButtons("theirs", theirs)}</div></fieldset>
      <p class="ptcg-note">샘플 덱은 공식 스탠다드 레귤레이션(마크 H, I, J)을 따릅니다. 규정은 <a href="https://pokemoncard.co.kr/card/play_qna" rel="noopener noreferrer">포켓몬 카드 게임 공식 플레이 안내</a>를 보세요. 한국판 목록에 확인된 카드는 우리 이름과 이미지를 쓰고, 아직 없는 카드는 영문 이름과 일본 공식 이미지를 씁니다.</p>
      <button type="button" data-start>대전 시작</button>
    </div><div data-board hidden></div>`;
  };

  const paintBoard = (view: GameView, note = ""): void => {
    const board = root.querySelector("[data-board]");
    if (!board) return;
    setBattleChrome(true);
    root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
    board.removeAttribute("hidden");
    board.innerHTML = boardHtml(view, note);
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
          setBattleChrome(true);
          root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
          board.removeAttribute("hidden");
          board.innerHTML = `<div class="ptcg-battle" data-battle><div class="ptcg-battle-hud"><button type="button" class="ptcg-hud-exit" data-exit>나가기</button></div><p class="ptcg-result" role="status">${esc(data.message || "대전을 진행하지 못했습니다")}</p><p class="ptcg-actions"><button type="button" data-restart>다시 하기</button> <button type="button" data-decks>덱 고르기</button></p></div>`;
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
        setBattleChrome(true);
        board.removeAttribute("hidden");
        board.innerHTML = `<div class="ptcg-battle" data-battle><p class="ptcg-result" role="status">엔진을 읽지 못했습니다</p></div>`;
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
    setBattleChrome(true);
    root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
    if (board) {
      board.removeAttribute("hidden");
      board.innerHTML = `<div class="ptcg-battle" data-battle><p class="ptcg-prompt" role="status">엔진을 읽고 있습니다</p></div>`;
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

  root.addEventListener("keydown", (event) => {
    const action = actionFromKey(event);
    if (action?.type === "close") {
      const zoom = root.querySelector("[data-zoom]");
      if (zoom instanceof HTMLDialogElement && zoom.open) {
        zoom.close();
        return;
      }
      const pile = root.querySelector("[data-pile-sheet]");
      if (pile instanceof HTMLDialogElement && pile.open) {
        pile.close();
        return;
      }
      closeLogDrawer(root);
      return;
    }
    if (action?.type === "zoom") openZoom(action.full, action.alt);
  });

  root.addEventListener("click", (event) => {
    const action = actionFromPointer(event);
    if (action?.type === "zoom") {
      openZoom(action.full, action.alt);
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-log-open]")) {
      openLogDrawer(root);
      return;
    }
    if (target.closest("[data-log-close]")) {
      closeLogDrawer(root);
      return;
    }
    const pileOpen = target.closest("[data-pile-open]");
    if (pileOpen instanceof HTMLElement) {
      const pileId = pileOpen.getAttribute("data-pile-open");
      if (pileId) openPileSheet(root, pileId);
      return;
    }
    if (target.closest("[data-pile-sheet-close]")) {
      closePileSheet(root);
      return;
    }
    const pileSheet = root.querySelector("[data-pile-sheet]");
    if (pileSheet instanceof HTMLDialogElement && target === pileSheet) {
      pileSheet.close();
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
    if (target.closest("[data-exit]") || target.closest("[data-decks]")) {
      showLobby();
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
}

import { findDropOption, targetsFor, type CardSpot } from "./actions.ts";
import {
  boardHtml,
  closeLogDrawer,
  closePileSheet,
  EMPTY_UI,
  openLogDrawer,
  openPileSheet,
  setBattleChrome,
  type BoardPaintOptions,
  type ViewUiState,
} from "./battle-board.ts";
import { boardHighlights } from "./bot-highlight.ts";
import { botStepDelayMs, playBotSteps, type BotPlaybackStep } from "./bot-playback.ts";
import { decks } from "./decks.ts";
import { type BotDifficulty, parseBotDifficulty } from "./difficulty.ts";
import { insertTutorialLobbyControls, mountTutorial } from "./tutorial-ui.ts";
import {
  applyBoardFx,
  collectFxEvents,
  prefersReducedMotion,
  sfxMutedDefault,
  writeSfxMuted,
} from "./fx.ts";
import { mappedFromView, parseSpot } from "./interact-ui.ts";
import { loadPrefs, lobbyHtml, resolveOpponentDeck, savePrefs, type LobbyPrefs } from "./lobby.ts";
import {
  coinMapsToFirst,
  createCoinAutoAdvance,
  goFirstOptionIndex,
  prebattleHtml,
  prebattlePhase,
  revealNote,
  type CoinSide,
} from "./prebattle.ts";
import type { GameView } from "./view.ts";

export { boardHtml } from "./battle-board.ts";
export type { BoardPaintOptions, ViewUiState } from "./battle-board.ts";

const HAND_HINT_KEY = "ptcg.hand-hint-seen";

interface WorkerIn {
  type: "start" | "restart" | "choose";
  engineUrl?: string;
  deck0?: number[];
  deck1?: number[];
  indices?: number[];
  difficulty?: BotDifficulty;
}

interface WorkerOut {
  type: "view" | "error";
  view?: GameView;
  message?: string;
  steps?: BotPlaybackStep[];
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
  let prefs: LobbyPrefs = loadPrefs();
  let mine = prefs.mine;
  let theirs = prefs.theirs;
  let difficulty: BotDifficulty = prefs.difficulty;
  let picked = new Set<number>();
  let latest: GameView | null = null;
  let previous: GameView | null = null;
  let busy = false;
  let muted = sfxMutedDefault(typeof localStorage === "undefined" ? null : localStorage);
  let uiState: ViewUiState = { ...EMPTY_UI };
  let dragSource: CardSpot | null = null;
  let noteText = "";
  let skipBot: (() => void) | null = null;
  let playbackToken = 0;
  let coinFlipped = false;
  let coinSide: CoinSide | null = null;
  let wasSetup = false;
  let showHandHint = typeof localStorage === "undefined" ? true : localStorage.getItem(HAND_HINT_KEY) !== "1";
  const coinAdvance = createCoinAutoAdvance({
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
  });

  const engineUrl = (): string => {
    const base = import.meta.env.BASE_URL || "/";
    return new URL("game/ptcg.mjs", window.location.origin + base).href;
  };

  const persist = (): void => {
    prefs = { mine, theirs, difficulty };
    savePrefs(prefs);
  };

  const showLobby = (): void => {
    setBattleChrome(false);
    skipBot?.();
    playbackToken += 1;
    coinAdvance.clear();
    latest = null;
    previous = null;
    coinFlipped = false;
    coinSide = null;
    wasSetup = false;
    paintLobby();
  };

  const paintLobby = (): void => {
    setBattleChrome(false);
    coinAdvance.clear();
    coinFlipped = false;
    coinSide = null;
    wasSetup = false;
    root.innerHTML = lobbyHtml({ mine, theirs, difficulty });
    const setup = root.querySelector(".ptcg-setup");
    if (setup) insertTutorialLobbyControls(setup);
  };

  const tutorial = mountTutorial(root, {
    renderBoard(view) {
      // Ensure a board host exists (lobby markup includes [data-board]).
      if (!root.querySelector("[data-board]")) {
        root.insertAdjacentHTML("beforeend", `<div data-board hidden></div>`);
      }
      paintBoard(view);
    },
    showLobby() {
      showLobby();
    },
  });

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

  const paintBoard = (view: GameView, note = "", paint: BoardPaintOptions = {}): void => {
    const board = root.querySelector("[data-board]");
    if (!board) return;
    const phase = prebattlePhase(view);
    if (phase === "setup") wasSetup = true;
    let banner = note;
    if (!phase && wasSetup && view.turn >= 1) {
      banner = banner || revealNote();
      wasSetup = false;
    }
    noteText = banner;
    root.querySelector(".ptcg-setup")?.setAttribute("hidden", "");
    board.removeAttribute("hidden");

    if (phase === "coin" || phase === "mulligan" || phase === "setup") {
      setBattleChrome(false);
      previous = view;
      if (phase === "coin") {
        board.innerHTML = `${prebattleHtml(view, {
          flipped: coinFlipped,
          side: coinSide,
          reducedMotion: prefersReducedMotion(),
        }) || ""}<p class="ptcg-actions"><button type="button" data-decks>덱 고르기</button></p>`;
      } else {
        coinAdvance.clear();
        coinFlipped = false;
        coinSide = null;
        board.innerHTML = `${prebattleHtml(view) || ""}<p class="ptcg-actions"><button type="button" data-decks>덱 고르기</button></p>`;
      }
      board.scrollIntoView({ block: "start" });
      return;
    }

    const events = collectFxEvents(previous, view);
    previous = view;
    setBattleChrome(true);
    coinAdvance.clear();
    coinFlipped = false;
    coinSide = null;
    board.innerHTML = boardHtml(view, banner, {
      note: banner,
      botTurn: Boolean(paint.botTurn),
      highlights: paint.highlights || [],
      ui: paint.ui || uiState,
      muted: paint.muted ?? muted,
      showHandHint: !paint.botTurn && showHandHint,
    }, paint.muted ?? muted);
    applyBoardFx(board, events, { reduced: prefersReducedMotion(), muted });
    if (!paint.botTurn) syncPressed();
  };

  const confirmCoin = (): void => {
    if (!latest || !coinSide || busy || prebattlePhase(latest) !== "coin") return;
    coinAdvance.clear();
    const goFirst = coinMapsToFirst(coinSide);
    const index = goFirstOptionIndex(latest.options, goFirst);
    choose([index]);
  };

  const finishHumanView = (view: GameView, note = ""): void => {
    latest = view;
    picked = new Set();
    uiState = { ...EMPTY_UI };
    dragSource = null;
    skipBot = null;
    busy = false;
    paintBoard(view, note);
  };

  const playIncoming = async (view: GameView, steps: BotPlaybackStep[] | undefined, note: string): Promise<void> => {
    const token = ++playbackToken;
    if (!steps || steps.length === 0) {
      finishHumanView(view, note);
      return;
    }
    busy = true;
    let prior: GameView | null = previous;
    await playBotSteps(steps, view, {
      delayMs: botStepDelayMs(prefersReducedMotion()),
      onStep: (step, controls) => {
        if (token !== playbackToken) {
          controls.skip();
          return;
        }
        skipBot = () => controls.skip();
        paintBoard(step.view, "상대가 두는 중", {
          botTurn: true,
          highlights: boardHighlights(prior, step.view),
        });
        prior = step.view;
      },
      onDone: (done) => {
        if (token !== playbackToken) return;
        finishHumanView(done, note);
      },
    });
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
      const data = event.data;
      if (data.type === "error") {
        busy = false;
        skipBot = null;
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
        void playIncoming(data.view, data.steps, data.message || "");
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
    const theirId = resolveOpponentDeck(theirs, mine);
    const deck1 = decks.find((deck) => deck.id === theirId);
    if (!deck0 || !deck1) return;
    persist();
    busy = true;
    coinAdvance.clear();
    coinFlipped = false;
    coinSide = null;
    wasSetup = false;
    const board = root.querySelector("[data-board]");
    setBattleChrome(false);
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
      difficulty,
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
    if (tutorial.isActive()) return;
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
      const drawer = root.querySelector("[data-log-drawer]");
      if (drawer instanceof HTMLElement && !drawer.hidden) {
        closeLogDrawer(root);
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
      // Tap always selects and opens the action bar (play / attach / 확대). Zoom is long-press or 확대.
      uiState = { selected: spot, targets: [], sheet: "hand" };
      if (showHandHint) {
        showHandHint = false;
        if (typeof localStorage !== "undefined") localStorage.setItem(HAND_HINT_KEY, "1");
      }
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
    const target = event.target;
    if (target instanceof Element && target.closest("[data-tutorial-start]")) {
      tutorial.start();
      return;
    }
    if (tutorial.isActive()) return;
    const action = actionFromPointer(event);
    if (!(target instanceof Element)) return;
    const acting = target.closest("[data-card-act]");
    if (acting instanceof HTMLElement) {
      const inHand = Boolean(acting.closest(".ptcg-hand--fan, .ptcg-zone--my-hand"));
      if (inHand) {
        activateCard(parseSpot(acting.getAttribute("data-spot")));
        return;
      }
      if (action?.type === "zoom") {
        activateCard(parseSpot(acting.getAttribute("data-spot")));
        return;
      }
    }
    if (action?.type === "zoom") {
      openZoom(action.full, action.alt);
      return;
    }
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
      persist();
      for (const button of root.querySelectorAll(`[data-deck="${group}"]`)) {
        button.setAttribute("aria-pressed", button.getAttribute("data-id") === id ? "true" : "false");
      }
      return;
    }
    const difficultyButton = target.closest("[data-difficulty]");
    if (difficultyButton instanceof HTMLButtonElement) {
      const id = difficultyButton.dataset.difficulty;
      if (id !== "easy" && id !== "normal" && id !== "hard") return;
      difficulty = parseBotDifficulty(id);
      persist();
      for (const button of root.querySelectorAll("[data-difficulty]")) {
        button.setAttribute("aria-pressed", button.getAttribute("data-difficulty") === id ? "true" : "false");
      }
      return;
    }
    if (target.closest("[data-sfx-mute]")) {
      muted = !muted;
      if (typeof localStorage !== "undefined") writeSfxMuted(muted, localStorage);
      const mute = root.querySelector("[data-sfx-mute]");
      if (mute instanceof HTMLButtonElement) {
        mute.setAttribute("aria-pressed", muted ? "true" : "false");
        mute.textContent = muted ? "소리 켜기" : "소리 끄기";
      }
      return;
    }
    if (target.closest("[data-skip-bot]")) {
      skipBot?.();
      return;
    }
    if (target.closest("[data-start]") || target.closest("[data-restart]")) {
      skipBot?.();
      playbackToken += 1;
      previous = null;
      start();
      return;
    }
    if (target.closest("[data-exit]") || target.closest("[data-decks]")) {
      showLobby();
      return;
    }
    if (target.closest("[data-clear-selection]")) {
      clearUi();
      return;
    }
    if (target.closest("[data-coin-flip]") && latest && prebattlePhase(latest) === "coin" && !busy) {
      coinFlipped = true;
      coinSide = Math.random() < 0.5 ? "heads" : "tails";
      paintBoard(latest);
      coinAdvance.arm(() => confirmCoin());
      return;
    }
    if (target.closest("[data-coin-confirm]") && latest && prebattlePhase(latest) === "coin" && coinSide && !busy) {
      confirmCoin();
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

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tutorial") === "1") tutorial.start();
  }
}

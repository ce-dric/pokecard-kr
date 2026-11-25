import {
  applyTutorialAction,
  createTutorialState,
  currentTutorialStep,
  markTutorialComplete,
  optionKeyForLabel,
  overlayHtml,
  shouldOfferTutorial,
  tagTutorialTargets,
  tutorialViewForStep,
  type TutorialState,
} from "./tutorial.ts";
import type { GameView } from "./view.ts";

function basePath(): string {
  const raw = import.meta.env?.BASE_URL || "/";
  const root = raw.endsWith("/") ? raw : `${raw}/`;
  return `${root}game/`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const SPOTLIGHT_PAD = 6;

/** Position the spotlight hole on the target's box and keep the coach off that box. */
export function layoutTutorialChrome(root: ParentNode): void {
  const target = root.querySelector("[data-tutorial-active='true']");
  const spot = root.querySelector("[data-tutorial-spotlight]");
  const coach = root.querySelector("[data-tutorial-coach]");
  if (!(spot instanceof HTMLElement)) return;

  if (!(target instanceof HTMLElement)) {
    spot.hidden = true;
    spot.style.width = "0";
    spot.style.height = "0";
    if (coach instanceof HTMLElement) coach.dataset.placement = "bottom";
    return;
  }

  const rect = target.getBoundingClientRect();
  const top = Math.max(0, rect.top - SPOTLIGHT_PAD);
  const left = Math.max(0, rect.left - SPOTLIGHT_PAD);
  const width = Math.max(rect.width + SPOTLIGHT_PAD * 2, 1);
  const height = Math.max(rect.height + SPOTLIGHT_PAD * 2, 1);
  spot.hidden = false;
  spot.style.top = `${top}px`;
  spot.style.left = `${left}px`;
  spot.style.width = `${width}px`;
  spot.style.height = `${height}px`;

  if (coach instanceof HTMLElement) {
    const mid = rect.top + rect.height / 2;
    const placeTop = mid > (typeof window !== "undefined" ? window.innerHeight * 0.45 : 400);
    coach.dataset.placement = placeTop ? "top" : "bottom";
  }

  if (!prefersReducedMotion()) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  } else {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }
}

function focusHighlight(root: Element, highlight: string | null): void {
  if (!highlight) return;
  const target = root.querySelector(`[data-tutorial-target="${highlight}"]`);
  if (!(target instanceof HTMLElement)) return;
  if (typeof target.focus === "function") {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }
  layoutTutorialChrome(root);
}

export interface TutorialMountOptions {
  renderBoard: (view: GameView) => void;
  showLobby: () => void;
}

export interface TutorialHost {
  start(): void;
  stop(): void;
  isActive(): boolean;
}

/** Attach the guided tutorial overlay. Board HTML comes from the host via renderBoard. */
export function mountTutorial(root: Element, options: TutorialMountOptions): TutorialHost {
  let state: TutorialState | null = null;
  let host: HTMLElement | null = null;
  let layoutFrame = 0;

  const scheduleLayout = (): void => {
    if (typeof window === "undefined") return;
    if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = 0;
      layoutTutorialChrome(root);
    });
  };

  const ensureHost = (): HTMLElement => {
    if (host && host.isConnected) return host;
    host = document.createElement("div");
    host.className = "ptcg-tutorial-host";
    host.setAttribute("data-tutorial-host", "");
    root.appendChild(host);
    return host;
  };

  const tagOptions = (board: Element): void => {
    for (const button of board.querySelectorAll("[data-option]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      const label = button.textContent?.trim() || "";
      const key = optionKeyForLabel(label);
      if (key) button.setAttribute("data-tutorial-target", `option-${key}`);
    }
    // Keep the text fallback and action sheet open so option highlights stay reachable.
    board.querySelector(".ptcg-fallback")?.setAttribute("open", "");
    const sheet = board.querySelector("[data-action-sheet]");
    if (sheet instanceof HTMLElement) sheet.hidden = false;
  };

  const paint = (): void => {
    if (!state?.active) {
      host?.remove();
      host = null;
      options.showLobby();
      return;
    }
    const step = currentTutorialStep(state);
    if (!step) return;
    options.renderBoard(tutorialViewForStep(step.id));
    const board = root.querySelector("[data-board]");
    if (board) {
      tagOptions(board);
      tagTutorialTargets(board, step);
      if (!board.querySelector("[data-tutorial-exit]")) {
        board.insertAdjacentHTML(
          "beforeend",
          `<p class="ptcg-actions"><button type="button" data-tutorial-exit>튜토리얼 나가기</button></p>`,
        );
      }
    }
    const shell = ensureHost();
    shell.innerHTML = overlayHtml(state, basePath());
    focusHighlight(root, step.highlight);
    scheduleLayout();
  };

  const dispatch = (action: Parameters<typeof applyTutorialAction>[1]): void => {
    if (!state?.active) return;
    const next = applyTutorialAction(state, action);
    state = next;
    if (next.completed) {
      markTutorialComplete(typeof localStorage === "undefined" ? null : localStorage);
    }
    paint();
  };

  root.addEventListener(
    "click",
    (event) => {
      if (!state?.active) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Block unrelated board clicks while a step is active.
      event.preventDefault();
      event.stopPropagation();
      if (target.closest("[data-tutorial-next]")) {
        dispatch({ type: "next" });
        return;
      }
      if (target.closest("[data-tutorial-back]")) {
        dispatch({ type: "back" });
        return;
      }
      if (target.closest("[data-tutorial-skip]") || target.closest("[data-tutorial-exit]")) {
        dispatch({ type: "skip" });
        return;
      }
      if (target.closest("[data-tutorial-finish]")) {
        dispatch({ type: "finish" });
        return;
      }
      const step = currentTutorialStep(state);
      const option = target.closest("[data-option]");
      if (option instanceof HTMLElement) {
        const key =
          option.getAttribute("data-tutorial-target")?.replace(/^option-/, "") ||
          optionKeyForLabel(option.textContent?.trim() || "");
        if (key) dispatch({ type: "option", key });
        return;
      }
      const zone = target.closest("[data-tutorial-target]");
      if (zone instanceof HTMLElement) {
        const id = zone.getAttribute("data-tutorial-target");
        if (!id || id.startsWith("option-")) return;
        if (step?.highlight && id !== step.highlight) return;
        dispatch({ type: "target", id });
      }
    },
    true,
  );

  if (typeof window !== "undefined") {
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("scroll", scheduleLayout, true);
  }

  return {
    start() {
      state = createTutorialState();
      paint();
    },
    stop() {
      if (!state) return;
      state = { ...state, active: false };
      paint();
    },
    isActive: () => Boolean(state?.active),
  };
}

export function insertTutorialLobbyControls(setup: Element): void {
  if (setup.querySelector("[data-tutorial-start]")) return;
  const offer = shouldOfferTutorial(typeof localStorage === "undefined" ? null : localStorage);
  const offerHtml = offer
    ? `<p class="ptcg-tutorial-offer" data-tutorial-offer role="status">처음이라면 튜토리얼로 한 차례를 연습해 보세요.</p>`
    : "";
  setup.insertAdjacentHTML(
    "afterbegin",
    `${offerHtml}<p class="ptcg-tutorial-entry"><button type="button" data-tutorial-start>튜토리얼</button></p>`,
  );
}

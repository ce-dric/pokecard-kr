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

function focusHighlight(root: Element, highlight: string | null): void {
  if (!highlight) return;
  const target = root.querySelector(`[data-tutorial-target="${highlight}"]`);
  if (!(target instanceof HTMLElement)) return;
  if (typeof target.focus === "function") {
    try {
      target.focus({ preventScroll: prefersReducedMotion() });
    } catch {
      target.focus();
    }
  }
  if (!prefersReducedMotion()) {
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
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
    // Keep the text fallback open so option highlights stay reachable.
    board.querySelector(".ptcg-fallback")?.setAttribute("open", "");
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

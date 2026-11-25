import assert from "node:assert/strict";
import test from "node:test";
import { boardHtml } from "./battle-board.ts";
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_STEP_COUNT,
  applyTutorialAction,
  createTutorialState,
  currentTutorialStep,
  isTutorialComplete,
  markTutorialComplete,
  optionKeyForLabel,
  overlayHtml,
  progressLabel,
  readTutorialComplete,
  shouldOfferTutorial,
  tagTutorialTargets,
  tutorialScenarioCards,
  tutorialViewForStep,
} from "./tutorial.ts";
import { layoutTutorialChrome } from "./tutorial-ui.ts";

test("tutorial starts on the board overview step", () => {
  const state = createTutorialState();
  assert.equal(state.active, true);
  assert.equal(state.stepIndex, 0);
  const step = currentTutorialStep(state);
  assert.ok(step);
  assert.equal(step.id, "board");
  assert.equal(step.kind, "observe");
  assert.equal(step.highlight, "you-playmat");
  assert.match(step.caption, /배틀필드|벤치|프라이즈|덱|트래쉬/);
  assert.equal(progressLabel(state), `1/${TUTORIAL_STEP_COUNT}`);
});

test("observe steps advance with next and retreat with back", () => {
  let state = createTutorialState();
  state = applyTutorialAction(state, { type: "next" });
  assert.equal(currentTutorialStep(state)?.id, "draw");
  assert.equal(progressLabel(state), `2/${TUTORIAL_STEP_COUNT}`);
  state = applyTutorialAction(state, { type: "back" });
  assert.equal(currentTutorialStep(state)?.id, "board");
});

test("wrong action does not advance an action step", () => {
  let state = createTutorialState();
  state = applyTutorialAction(state, { type: "next" });
  assert.equal(currentTutorialStep(state)?.id, "draw");
  const before = state.stepIndex;
  state = applyTutorialAction(state, { type: "target", id: "you-bench" });
  assert.equal(state.stepIndex, before);
  state = applyTutorialAction(state, { type: "next" });
  assert.equal(state.stepIndex, before);
  state = applyTutorialAction(state, { type: "option", key: "bench" });
  assert.equal(state.stepIndex, before);
});

test("correct action advances each interactive step", () => {
  let state = createTutorialState();
  const sequence: Array<{ id: string; action: Parameters<typeof applyTutorialAction>[1] }> = [
    { id: "board", action: { type: "next" } },
    { id: "draw", action: { type: "target", id: "you-deck" } },
    { id: "bench", action: { type: "option", key: "bench" } },
    { id: "energy", action: { type: "option", key: "energy" } },
    { id: "trainer", action: { type: "option", key: "trainer" } },
    { id: "attack", action: { type: "option", key: "attack" } },
    { id: "bot", action: { type: "next" } },
  ];
  for (const item of sequence) {
    assert.equal(currentTutorialStep(state)?.id, item.id);
    state = applyTutorialAction(state, item.action);
  }
  assert.equal(currentTutorialStep(state)?.id, "done");
  assert.equal(currentTutorialStep(state)?.kind, "done");
  assert.equal(progressLabel(state), `${TUTORIAL_STEP_COUNT}/${TUTORIAL_STEP_COUNT}`);
});

test("skip exits the tutorial without marking complete unless finished", () => {
  let state = createTutorialState();
  state = applyTutorialAction(state, { type: "skip" });
  assert.equal(state.active, false);
  assert.equal(state.completed, false);
});

test("finishing the last step marks the tutorial complete", () => {
  let state = createTutorialState();
  for (const action of [
    { type: "next" as const },
    { type: "target" as const, id: "you-deck" },
    { type: "option" as const, key: "bench" },
    { type: "option" as const, key: "energy" },
    { type: "option" as const, key: "trainer" },
    { type: "option" as const, key: "attack" },
    { type: "next" as const },
  ]) {
    state = applyTutorialAction(state, action);
  }
  assert.equal(currentTutorialStep(state)?.id, "done");
  state = applyTutorialAction(state, { type: "finish" });
  assert.equal(state.active, false);
  assert.equal(state.completed, true);
  assert.equal(isTutorialComplete(state), true);
});

test("scenario uses only verified Korean card names from the site data", () => {
  const cards = tutorialScenarioCards();
  assert.deepEqual(
    cards.map((card) => card.nameKo).sort(),
    ["가이오가", "기본 물 에너지", "눈쓰개", "돌살이", "릴리에의 결심"].sort(),
  );
  for (const card of cards) {
    assert.equal(card.nameKo.includes("\u00b7"), false);
    assert.ok(card.image);
  }
});

test("localStorage helpers remember completion and never force a repeat offer", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
  };
  assert.equal(readTutorialComplete(storage), false);
  assert.equal(shouldOfferTutorial(storage), true);
  markTutorialComplete(storage);
  assert.equal(readTutorialComplete(storage), true);
  assert.equal(shouldOfferTutorial(storage), false);
  assert.equal(storage.getItem(TUTORIAL_STORAGE_KEY), "1");
});

test("landscape board HTML keeps stable tutorial targets for every step", () => {
  const zones = [
    "you-playmat",
    "you-deck",
    "you-bench",
    "you-prize",
    "you-discard",
    "you-hand",
    "you-active",
    "opp-playmat",
  ];
  for (const step of [
    "board",
    "draw",
    "bench",
    "energy",
    "trainer",
    "attack",
    "bot",
    "done",
  ] as const) {
    const view = tutorialViewForStep(step);
    const html = boardHtml(view);
    assert.equal(html.includes("\u00b7"), false);
    for (const zone of zones) {
      assert.match(html, new RegExp(`data-tutorial-target="${zone}"`));
    }
    if (step === "bench" || step === "energy" || step === "trainer" || step === "attack") {
      const key = step === "bench" ? "bench" : step === "energy" ? "energy" : step === "trainer" ? "trainer" : "attack";
      const option = view.options.find((row) => optionKeyForLabel(row.label) === key);
      assert.ok(option, step);
      assert.match(html, new RegExp(`data-option="${option.index}"`));
    }
  }
});

test("tutorial captions stay Korean and avoid the middle dot", () => {
  let state = createTutorialState();
  for (let i = 0; i < TUTORIAL_STEP_COUNT; i += 1) {
    const step = currentTutorialStep(state);
    assert.ok(step);
    assert.equal(step.caption.includes("\u00b7"), false);
    assert.match(step.caption, /[가-힣]/);
    if (i < TUTORIAL_STEP_COUNT - 1) {
      const action =
        step.kind === "observe" || step.kind === "auto" || step.kind === "done"
          ? ({ type: "next" } as const)
          : step.expected!;
      state = applyTutorialAction(state, action.type === "option" || action.type === "target" ? action : { type: "next" });
    }
  }
});

test("overlay ships a spotlight hole and coach placement hook", () => {
  const html = overlayHtml(createTutorialState(), "/pokecard-kr/game/");
  assert.match(html, /data-tutorial-spotlight/);
  assert.match(html, /data-tutorial-coach/);
  assert.match(html, /data-placement="bottom"/);
  assert.equal(html.includes("\u00b7"), false);
});

test("hand action verbs map onto tutorial option keys", () => {
  assert.equal(optionKeyForLabel("벤치에 내기"), "bench");
  assert.equal(optionKeyForLabel("에너지 붙이기"), "energy");
  assert.equal(optionKeyForLabel("사용하기"), "trainer");
});

test("tutorial highlight helpers clear zones and size the spotlight hole", async () => {
  const { readFileSync } = await import("node:fs");
  const tutorialSrc = readFileSync(new URL("./tutorial.ts", import.meta.url), "utf8");
  const uiSrc = readFileSync(new URL("./tutorial-ui.ts", import.meta.url), "utf8");
  assert.doesNotMatch(tutorialSrc, /dataset\.tutorialZone\) continue/);
  assert.match(tutorialSrc, /node\.removeAttribute\("data-tutorial-active"\)/);
  assert.match(uiSrc, /getBoundingClientRect/);
  assert.match(uiSrc, /dataset\.placement/);
  assert.match(uiSrc, /data-tutorial-spotlight/);
  assert.equal(typeof layoutTutorialChrome, "function");
  assert.equal(typeof tagTutorialTargets, "function");
});

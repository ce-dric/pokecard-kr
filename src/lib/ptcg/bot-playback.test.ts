import assert from "node:assert/strict";
import test from "node:test";
import { botStepDelayMs, playBotSteps, type BotPlaybackStep } from "./bot-playback.ts";
import type { GameView } from "./view.ts";

const view = (prompt: string): GameView =>
  ({
    phase: "choose",
    prompt,
    minCount: 0,
    maxCount: 0,
    options: [],
    log: [],
    you: {
      active: [],
      bench: [],
      hand: null,
      handCount: 0,
      prizeCount: 0,
      discard: [],
      discardCount: 0,
      deckCount: 0,
      conditions: [],
    },
    opp: {
      active: [],
      bench: [],
      hand: null,
      handCount: 0,
      prizeCount: 0,
      discard: [],
      discardCount: 0,
      deckCount: 0,
      conditions: [],
    },
    turn: 1,
    resultText: null,
    stadium: null,
  }) as GameView;

test("botStepDelayMs is zero when reduced motion is preferred", () => {
  assert.equal(botStepDelayMs(true), 0);
  assert.ok(botStepDelayMs(false) >= 600);
  assert.ok(botStepDelayMs(false) <= 900);
});

test("playBotSteps paints each step then the final view", async () => {
  const painted: string[] = [];
  const steps: BotPlaybackStep[] = [
    { view: view("a"), caption: "첫 행동" },
    { view: view("b"), caption: "둘째 행동" },
  ];
  const final = view("final");
  await playBotSteps(steps, final, {
    delayMs: 0,
    onStep: (step) => painted.push(`${step.view.prompt}:${step.caption}`),
    onDone: (done) => painted.push(`done:${done.prompt}`),
  });
  assert.deepEqual(painted, ["a:첫 행동", "b:둘째 행동", "done:final"]);
});

test("playBotSteps skip jumps to the final view", async () => {
  const painted: string[] = [];
  let resolveWait: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });
  const steps: BotPlaybackStep[] = [
    { view: view("a"), caption: "하나" },
    { view: view("b"), caption: "둘" },
    { view: view("c"), caption: "셋" },
  ];
  const playback = playBotSteps(steps, view("final"), {
    delayMs: 50_000,
    onStep: (step, controls) => {
      painted.push(step.caption);
      if (step.caption === "하나") {
        resolveWait?.();
        controls.skip();
      }
    },
    onDone: (done) => painted.push(`done:${done.prompt}`),
  });
  await waiting;
  await playback;
  assert.deepEqual(painted, ["하나", "done:final"]);
});

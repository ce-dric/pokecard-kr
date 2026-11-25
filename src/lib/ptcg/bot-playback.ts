import type { GameView } from "./view.ts";

export interface BotPlaybackStep {
  view: GameView;
  caption: string;
}

export interface BotPlaybackControls {
  skip(): void;
}

export interface PlayBotStepsOptions {
  delayMs: number;
  onStep: (step: BotPlaybackStep, controls: BotPlaybackControls) => void;
  onDone: (view: GameView) => void;
  wait?: (ms: number, signal: { skipped: boolean }) => Promise<void>;
}

export const BOT_STEP_DELAY_MS = 620;

export function botStepDelayMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : BOT_STEP_DELAY_MS;
}

export function prefersReducedMotion(query?: { matches: boolean } | null): boolean {
  return Boolean(query?.matches);
}

function defaultWait(ms: number, signal: { skipped: boolean }): Promise<void> {
  if (ms <= 0 || signal.skipped) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      clearInterval(poll);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const poll = setInterval(() => {
      if (signal.skipped) finish();
    }, 16);
  });
}

export async function playBotSteps(
  steps: BotPlaybackStep[],
  finalView: GameView,
  options: PlayBotStepsOptions,
): Promise<void> {
  const signal = { skipped: false };
  const controls: BotPlaybackControls = {
    skip() {
      signal.skipped = true;
    },
  };
  const wait = options.wait || defaultWait;
  for (const step of steps) {
    if (signal.skipped) break;
    options.onStep(step, controls);
    if (signal.skipped) break;
    await wait(options.delayMs, signal);
  }
  options.onDone(finalView);
}

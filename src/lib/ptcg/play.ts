import { greedyChoice } from "./bot.ts";
import { applySelect, finishBattle, readObservation, startBattle } from "./engine.ts";
import type { Catalogs, PtcgModule } from "./types.ts";

export interface BotGameResult {
  ok: boolean;
  result: number;
  turn: number;
  steps: number;
  attacks: number;
  reason: number | null;
  error?: number;
  errorPlayer?: number;
  errorType?: number;
}

export function playBotGame(
  engine: PtcgModule,
  deck0: number[],
  deck1: number[],
  catalogs: Catalogs,
  maxSteps = 5000,
): BotGameResult {
  const started = startBattle(engine, deck0, deck1);
  if (!started.battlePtr || started.errorType) {
    return {
      ok: false,
      result: -1,
      turn: 0,
      steps: 0,
      attacks: 0,
      reason: null,
      errorPlayer: started.errorPlayer,
      errorType: started.errorType,
    };
  }
  let obs = readObservation(engine, started.battlePtr);
  let steps = 0;
  let attacks = 0;
  try {
    while (obs.current.result === -1 && steps < maxSteps) {
      const choice = greedyChoice(obs, catalogs);
      const error = applySelect(engine, started.battlePtr, choice);
      if (error) {
        return { ok: false, result: -1, turn: obs.current.turn, steps, attacks, reason: null, error };
      }
      obs = readObservation(engine, started.battlePtr);
      attacks += (obs.logs || []).filter((log) => log.type === 15).length;
      steps += 1;
    }
    const reason = (obs.logs || []).find((log) => log.type === 23)?.reason ?? null;
    const finished = obs.current.result === 0 || obs.current.result === 1 || obs.current.result === 2;
    return { ok: finished, result: obs.current.result, turn: obs.current.turn, steps, attacks, reason };
  } finally {
    finishBattle(engine, started.battlePtr);
  }
}

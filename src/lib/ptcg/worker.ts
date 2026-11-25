import mappingFile from "../../data/game-cards.json" with { type: "json" };
import { collectGreedyBotTurn, type BotStep } from "./bot-turn.ts";
import { applySelect, finishBattle, loadCatalogs, loadEngine, readObservation, startBattle, startErrors } from "./engine.ts";
import type { BattleLog, CardMapping, Catalogs, Observation, PtcgModule } from "./types.ts";
import { buildView, formatLog, redactLogs, type GameView } from "./view.ts";

const mapping = mappingFile as CardMapping;
const HUMAN = 0;

let engine: PtcgModule | null = null;
let catalogs: Catalogs | null = null;
let battlePtr = 0;
let obs: Observation | null = null;
let committed: BattleLog[] = [];
let pending: BattleLog[] = [];
let endReason: number | undefined;

function lines(): string[] {
  if (!catalogs) return [];
  return committed
    .concat(pending)
    .map((log) => formatLog(log, HUMAN, catalogs!.cards, catalogs!.attacks, mapping))
    .filter(Boolean)
    .slice(-80);
}

function currentView(): GameView | null {
  if (!obs || !catalogs) return null;
  return buildView(obs, HUMAN, lines(), catalogs, mapping, endReason);
}

function publish(message?: string, steps?: BotStep[]): void {
  const view = currentView();
  if (!view) return;
  const payload: { type: "view"; view: GameView; message?: string; steps?: BotStep[] } = { type: "view", view };
  if (message) payload.message = message;
  if (steps && steps.length > 0) payload.steps = steps;
  self.postMessage(payload);
}

function absorb(next: Observation): void {
  const logs = redactLogs(next.logs || [], HUMAN);
  if (next.current.yourIndex === HUMAN) {
    pending = [];
    committed.push(...logs);
  } else {
    pending.push(...logs);
  }
  const resultLog = (next.logs || []).find((log) => log.type === 23);
  if (resultLog?.reason != null) endReason = resultLog.reason;
  obs = next;
}

function runBots(): void {
  if (!engine || !catalogs || !obs) return;
  const result = collectGreedyBotTurn({
    humanSeat: HUMAN,
    catalogs,
    mapping,
    getObservation: () => obs!,
    applyChoice: (indices) => {
      const error = applySelect(engine!, battlePtr, indices);
      if (error) return error;
      absorb(readObservation(engine!, battlePtr));
      return null;
    },
    buildView: () => currentView()!,
  });
  if (result.error) {
    self.postMessage({ type: "error", message: result.error });
    return;
  }
  publish(undefined, result.steps);
}

async function boot(engineUrl: string, deck0: number[], deck1: number[]): Promise<void> {
  if (!engine) {
    engine = await loadEngine(engineUrl);
    catalogs = loadCatalogs(engine);
  }
  if (battlePtr) {
    finishBattle(engine, battlePtr);
    battlePtr = 0;
  }
  committed = [];
  pending = [];
  endReason = undefined;
  const started = startBattle(engine, deck0, deck1);
  if (!started.battlePtr || started.errorType) {
    const why = startErrors[started.errorType] || "덱을 받지 못했습니다";
    self.postMessage({ type: "error", message: why });
    return;
  }
  battlePtr = started.battlePtr;
  absorb(readObservation(engine, battlePtr));
  runBots();
}

function choose(indices: number[]): void {
  if (!engine || !obs || !obs.select) return;
  const select = obs.select;
  if (indices.length < select.minCount || indices.length > select.maxCount) {
    self.postMessage({ type: "error", message: "고른 수가 맞지 않습니다" });
    return;
  }
  const unique = new Set(indices);
  if (unique.size !== indices.length || indices.some((index) => index < 0 || index >= select.option.length)) {
    self.postMessage({ type: "error", message: "그 선택은 쓸 수 없습니다" });
    return;
  }
  const error = applySelect(engine, battlePtr, indices);
  if (error) {
    self.postMessage({ type: "error", message: "엔진이 그 선택을 거절했습니다" });
    return;
  }
  absorb(readObservation(engine, battlePtr));
  runBots();
}

self.onmessage = (event: MessageEvent<{ type: string; engineUrl?: string; deck0?: number[]; deck1?: number[]; indices?: number[] }>) => {
  const message = event.data;
  const run = async () => {
    if ((message.type === "start" || message.type === "restart") && message.engineUrl && message.deck0 && message.deck1) {
      await boot(message.engineUrl, message.deck0, message.deck1);
      return;
    }
    if (message.type === "choose" && message.indices) choose(message.indices);
  };
  run().catch(() => {
    self.postMessage({ type: "error", message: "대전을 진행하지 못했습니다" });
  });
};

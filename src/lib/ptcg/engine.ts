import type { AttackData, CardData, Catalogs, Observation, PtcgModule } from "./types.ts";

const START_BYTES = 16;
const SERIAL_BYTES = 16;

interface FactoryModule {
  default: (options?: { locateFile?: (path: string) => string }) => Promise<PtcgModule>;
}

/**
 * BattleStart and GetBattleData return C structs. Emscripten compiles those
 * as a caller-provided result pointer in the first argument.
 */
export async function loadEngine(moduleUrl: URL | string): Promise<PtcgModule> {
  const href = typeof moduleUrl === "string" ? moduleUrl : moduleUrl.href;
  const imported = (await import(/* @vite-ignore */ href)) as FactoryModule;
  const engine = await imported.default({
    locateFile(path) {
      return new URL(path, href).href;
    },
  });
  engine._GameInitialize();
  return engine;
}

function writeInts(engine: PtcgModule, values: number[]): number {
  const ptr = engine._malloc(Math.max(1, values.length) * 4);
  for (let i = 0; i < values.length; i += 1) {
    engine.setValue(ptr + i * 4, values[i] | 0, "i32");
  }
  return ptr;
}

export interface BattleStartResult {
  battlePtr: number;
  errorPlayer: number;
  errorType: number;
}

export function startBattle(engine: PtcgModule, deck0: number[], deck1: number[]): BattleStartResult {
  if (deck0.length !== 60 || deck1.length !== 60) {
    throw new Error("A deck must contain 60 cards");
  }
  const cards = writeInts(engine, deck0.concat(deck1));
  const out = engine._malloc(START_BYTES);
  try {
    engine._BattleStart(out, cards);
    return {
      battlePtr: engine.getValue(out, "*"),
      errorPlayer: engine.getValue(out + 4, "i32"),
      errorType: engine.getValue(out + 8, "i32"),
    };
  } finally {
    engine._free(cards);
    engine._free(out);
  }
}

export function readObservation(engine: PtcgModule, battlePtr: number): Observation {
  const out = engine._malloc(SERIAL_BYTES);
  try {
    engine._GetBattleData(out, battlePtr);
    const jsonPtr = engine.getValue(out, "*");
    return JSON.parse(engine.UTF8ToString(jsonPtr)) as Observation;
  } finally {
    engine._free(out);
  }
}

export function applySelect(engine: PtcgModule, battlePtr: number, indices: number[]): number {
  const ptr = writeInts(engine, indices);
  try {
    return engine._Select(battlePtr, ptr, indices.length);
  } finally {
    engine._free(ptr);
  }
}

export function finishBattle(engine: PtcgModule, battlePtr: number): void {
  if (battlePtr) engine._BattleFinish(battlePtr);
}

export function loadCatalogs(engine: PtcgModule): Catalogs {
  const cards = JSON.parse(engine.UTF8ToString(engine._AllCard())) as CardData[];
  const attacks = JSON.parse(engine.UTF8ToString(engine._AllAttack())) as AttackData[];
  return {
    cards: new Map(cards.map((card) => [card.cardId, card])),
    attacks: new Map(attacks.map((attack) => [attack.attackId, attack])),
  };
}

export const startErrors: Record<number, string> = {
  1: "덱에 없는 카드가 있습니다",
  2: "같은 카드가 4장보다 많습니다",
  3: "기본 포켓몬이 없습니다",
  4: "ACE SPEC 카드가 둘 이상입니다",
};

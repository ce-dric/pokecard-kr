import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import mappingFile from "../../data/game-cards.json" with { type: "json" };
import { collectGreedyBotTurn } from "./bot-turn.ts";
import { decks } from "./decks.ts";
import { applySelect, finishBattle, loadCatalogs, loadEngine, readObservation, startBattle } from "./engine.ts";
import type { CardMapping } from "./types.ts";
import { buildView, formatLog, redactLogs } from "./view.ts";

const mapping = mappingFile as CardMapping;
const HUMAN = 0;

test("worker-style bot turn sends a step list with captions and views", async () => {
  const engine = await loadEngine(new URL("../../../public/game/ptcg.mjs", import.meta.url));
  const catalogs = loadCatalogs(engine);
  const sample = decks.find((deck) => deck.id === "sample");
  assert.ok(sample);
  const started = startBattle(engine, sample.cards, sample.cards);
  assert.ok(started.battlePtr);
  let obs = readObservation(engine, started.battlePtr);
  const committed: ReturnType<typeof redactLogs> = [];
  let pending: ReturnType<typeof redactLogs> = [];
  let endReason: number | undefined;
  let guard = 0;

  const absorb = (next: typeof obs) => {
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
  };

  absorb(obs);

  // Drive the human seat with the same greedy chooser until the bot acts, then collect steps.
  while (obs.current.result === -1 && obs.current.yourIndex === HUMAN && guard < 400) {
    const { greedyChoice } = await import("./bot.ts");
    const choice = greedyChoice(obs, catalogs);
    const error = applySelect(engine, started.battlePtr, choice);
    assert.equal(error, 0, `human apply failed: ${error}`);
    absorb(readObservation(engine, started.battlePtr));
    guard += 1;
  }

  if (obs.current.result !== -1) {
    finishBattle(engine, started.battlePtr);
    return;
  }

  assert.equal(obs.current.yourIndex, 1);

  const lines = () =>
    committed
      .concat(pending)
      .map((log) => formatLog(log, HUMAN, catalogs.cards, catalogs.attacks, mapping))
      .filter(Boolean)
      .slice(-80);

  const result = collectGreedyBotTurn({
    humanSeat: HUMAN,
    catalogs,
    mapping,
    getObservation: () => obs,
    applyChoice: (indices) => {
      const error = applySelect(engine, started.battlePtr, indices);
      if (error) return error;
      absorb(readObservation(engine, started.battlePtr));
      return null;
    },
    buildView: () => buildView(obs, HUMAN, lines(), catalogs, mapping, endReason),
  });

  finishBattle(engine, started.battlePtr);
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.ok(result.steps.length > 0, "bot turn should emit at least one step");
  for (const step of result.steps) {
    assert.ok(step.caption.startsWith("상대"));
    assert.equal(step.caption.includes("\u00b7"), false);
    assert.ok(step.view);
    assert.ok(Array.isArray(step.view.log));
  }
  assert.equal(obs.current.yourIndex === HUMAN || obs.current.result !== -1, true);
});

test("bot turn modules avoid the middle dot character", () => {
  for (const name of ["bot-turn.ts", "bot-playback.ts", "bot-turn.test.ts", "bot-playback.test.ts", "bot-turn-engine.test.ts"]) {
    const text = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.equal(text.includes("\u00b7"), false, name);
  }
});

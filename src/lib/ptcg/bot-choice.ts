import { greedyChoice } from "./bot.ts";
import { hardChoice } from "./bot-hard.ts";
import { normalChoice } from "./bot-normal.ts";
import type { BotDifficulty } from "./difficulty.ts";
import type { Catalogs, Observation } from "./types.ts";

export function botChoice(
  obs: Observation,
  catalogs: Catalogs,
  difficulty: BotDifficulty = "easy",
): number[] {
  if (difficulty === "hard") return hardChoice(obs, catalogs);
  if (difficulty === "normal") return normalChoice(obs, catalogs);
  return greedyChoice(obs, catalogs);
}

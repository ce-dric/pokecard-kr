export type BotDifficulty = "easy" | "normal" | "hard";

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ["easy", "normal", "hard"];

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

export const BOT_DIFFICULTY_STORAGE_KEY = "pokecard-kr.bot-difficulty";

export function parseBotDifficulty(value: string | null | undefined): BotDifficulty {
  if (value === "easy" || value === "normal" || value === "hard") return value;
  return "normal";
}

export function readStoredBotDifficulty(storage: Pick<Storage, "getItem"> | null | undefined): BotDifficulty {
  if (!storage) return "normal";
  try {
    return parseBotDifficulty(storage.getItem(BOT_DIFFICULTY_STORAGE_KEY));
  } catch {
    return "normal";
  }
}

export function writeStoredBotDifficulty(
  storage: Pick<Storage, "setItem"> | null | undefined,
  difficulty: BotDifficulty,
): void {
  if (!storage) return;
  try {
    storage.setItem(BOT_DIFFICULTY_STORAGE_KEY, difficulty);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

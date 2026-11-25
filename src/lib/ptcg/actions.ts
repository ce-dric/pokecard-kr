import type { AttackData, CardData, Observation, Option } from "./types.ts";

export type ActionKind =
  | "play"
  | "attach"
  | "evolve"
  | "attack"
  | "retreat"
  | "ability"
  | "end"
  | "yes"
  | "no"
  | "select"
  | "number"
  | "other";

export interface CardSpot {
  area: number;
  index: number;
  playerIndex: number;
}

export interface MappedOption {
  optionIndex: number;
  kind: ActionKind;
  source: CardSpot | null;
  target: CardSpot | null;
  attackId?: number;
  playAs?: "bench" | "use";
}

export type InteractionMode = "board" | "picker" | "buttons" | "none";

const PLAY = 7;
const ATTACH = 8;
const EVOLVE = 9;
const ABILITY = 10;
const RETREAT = 12;
const ATTACK = 13;
const END = 14;
const YES = 1;
const NO = 2;
const NUMBER = 0;
const CARD = 3;
const TOOL_CARD = 4;
const ENERGY_CARD = 5;

export function interactionMode(
  select: Observation["select"],
  phase: "choose" | "over",
  myTurn: boolean,
): InteractionMode {
  if (phase === "over" || !myTurn || !select) return "none";
  if (select.type === 0 && select.context === 0) return "board";
  const kinds = new Set(select.option.map((option) => option.type));
  if ([...kinds].every((type) => type === YES || type === NO)) return "buttons";
  if ([...kinds].every((type) => type === NUMBER)) return "buttons";
  if ([...kinds].some((type) => type === CARD || type === TOOL_CARD || type === ENERGY_CARD || type === 6)) {
    return "picker";
  }
  return "buttons";
}

export function mapOption(
  obs: Observation,
  option: Option,
  optionIndex: number,
  cards: Map<number, CardData>,
): MappedOption {
  const you = obs.current.yourIndex;
  switch (option.type) {
    case PLAY: {
      const hand = obs.current.players[you]?.hand?.[option.index ?? -1];
      const data = hand ? cards.get(hand.id) : undefined;
      const playAs = data?.cardType === 0 && data.basic ? "bench" : "use";
      return {
        optionIndex,
        kind: "play",
        source: { playerIndex: you, area: 2, index: option.index ?? 0 },
        target: null,
        playAs,
      };
    }
    case ATTACH:
      return {
        optionIndex,
        kind: "attach",
        source: {
          playerIndex: you,
          area: option.area ?? 2,
          index: option.index ?? 0,
        },
        target:
          option.inPlayArea == null || option.inPlayIndex == null
            ? null
            : { playerIndex: you, area: option.inPlayArea, index: option.inPlayIndex },
      };
    case EVOLVE:
      return {
        optionIndex,
        kind: "evolve",
        source: {
          playerIndex: you,
          area: option.area ?? 2,
          index: option.index ?? 0,
        },
        target:
          option.inPlayArea == null || option.inPlayIndex == null
            ? null
            : { playerIndex: you, area: option.inPlayArea, index: option.inPlayIndex },
      };
    case ABILITY:
      return {
        optionIndex,
        kind: "ability",
        source: {
          playerIndex: option.playerIndex ?? you,
          area: option.area ?? 4,
          index: option.index ?? 0,
        },
        target: null,
      };
    case RETREAT:
      return {
        optionIndex,
        kind: "retreat",
        source: { playerIndex: you, area: 4, index: 0 },
        target: null,
      };
    case ATTACK:
      return {
        optionIndex,
        kind: "attack",
        source: { playerIndex: you, area: 4, index: 0 },
        target: null,
        attackId: option.attackId,
      };
    case END:
      return { optionIndex, kind: "end", source: null, target: null };
    case YES:
      return { optionIndex, kind: "yes", source: null, target: null };
    case NO:
      return { optionIndex, kind: "no", source: null, target: null };
    case NUMBER:
      return { optionIndex, kind: "number", source: null, target: null };
    case CARD:
    case TOOL_CARD:
    case ENERGY_CARD:
      return {
        optionIndex,
        kind: "select",
        source: {
          playerIndex: option.playerIndex ?? you,
          area: option.area ?? 2,
          index: option.index ?? 0,
        },
        target: null,
      };
    default:
      return { optionIndex, kind: "other", source: null, target: null };
  }
}

export function mapOptions(
  obs: Observation,
  cards: Map<number, CardData>,
): MappedOption[] {
  if (!obs.select) return [];
  return obs.select.option.map((option, index) => mapOption(obs, option, index, cards));
}

export function handActions(mapped: MappedOption[], handIndex: number, playerIndex: number): MappedOption[] {
  return mapped.filter(
    (row) =>
      row.source &&
      row.source.playerIndex === playerIndex &&
      row.source.area === 2 &&
      row.source.index === handIndex &&
      (row.kind === "play" || row.kind === "attach" || row.kind === "evolve"),
  );
}

export function targetsFor(
  mapped: MappedOption[],
  kind: "attach" | "evolve",
  handIndex: number,
  playerIndex: number,
): MappedOption[] {
  return mapped.filter(
    (row) =>
      row.kind === kind &&
      row.source?.playerIndex === playerIndex &&
      row.source.area === 2 &&
      row.source.index === handIndex &&
      row.target,
  );
}

export function activeActions(mapped: MappedOption[], playerIndex: number): MappedOption[] {
  return mapped.filter(
    (row) =>
      row.source &&
      row.source.playerIndex === playerIndex &&
      row.source.area === 4 &&
      (row.kind === "attack" || row.kind === "retreat" || row.kind === "ability"),
  );
}

export function playableSpots(mapped: MappedOption[]): CardSpot[] {
  const seen = new Set<string>();
  const spots: CardSpot[] = [];
  for (const row of mapped) {
    if (!row.source) continue;
    if (row.kind === "end" || row.kind === "yes" || row.kind === "no" || row.kind === "number") continue;
    const key = `${row.source.playerIndex}:${row.source.area}:${row.source.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spots.push(row.source);
  }
  return spots;
}

export function findDropOption(
  mapped: MappedOption[],
  source: CardSpot,
  target: CardSpot,
): MappedOption | null {
  const attach = mapped.find(
    (row) =>
      row.kind === "attach" &&
      row.source &&
      row.target &&
      sameSpot(row.source, source) &&
      sameSpot(row.target, target),
  );
  if (attach) return attach;
  const evolve = mapped.find(
    (row) =>
      row.kind === "evolve" &&
      row.source &&
      row.target &&
      sameSpot(row.source, source) &&
      sameSpot(row.target, target),
  );
  if (evolve) return evolve;
  if (target.area === 5) {
    const play = mapped.find(
      (row) => row.kind === "play" && row.playAs === "bench" && row.source && sameSpot(row.source, source),
    );
    if (play) return play;
  }
  return null;
}

export function sameSpot(a: CardSpot, b: CardSpot): boolean {
  return a.area === b.area && a.index === b.index && a.playerIndex === b.playerIndex;
}

export function attackSheetRows(
  mapped: MappedOption[],
  attacks: Map<number, AttackData>,
  energyNames: string[],
): Array<{
  optionIndex: number;
  name: string;
  damage: number;
  energies: string[];
}> {
  return mapped
    .filter((row) => row.kind === "attack")
    .map((row) => {
      const attack = row.attackId == null ? undefined : attacks.get(row.attackId);
      return {
        optionIndex: row.optionIndex,
        name: attack?.name || "공격",
        damage: attack?.damage ?? 0,
        energies: (attack?.energies || []).map((type) => energyNames[type] || "colorless"),
      };
    });
}

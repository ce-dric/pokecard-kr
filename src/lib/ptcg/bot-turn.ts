import { greedyChoice } from "./bot.ts";
import type { AttackData, CardData, CardMapping, Catalogs, Observation, Option } from "./types.ts";
import { cardName, cleanText, optionLabel, type GameView } from "./view.ts";

export interface BotStep {
  view: GameView;
  caption: string;
}

function optionTarget(obs: Observation, option: Option) {
  const you = obs.current.yourIndex;
  const owner = option.playerIndex ?? you;
  const player = obs.current.players[owner];
  if (option.type === 7) return obs.current.players[you]?.hand?.[option.index ?? -1];
  if (option.area === 1 || option.area === 12) return obs.current.looking?.[option.index ?? -1];
  if (option.area === 7) return obs.current.stadium?.[option.index ?? -1];
  if (!player) return undefined;
  if (option.area === 2 && owner === you) return player.hand?.[option.index ?? -1];
  if (option.area === 3) return player.discard?.[option.index ?? -1];
  if (option.area === 4) return player.active?.[option.index ?? -1] || undefined;
  if (option.area === 5) return player.bench?.[option.index ?? -1];
  return undefined;
}

function captionOne(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
  mapping: CardMapping,
): string {
  const named = (id: number | undefined) => cardName(id, cards, mapping);
  switch (option.type) {
    case 8: {
      const target = named(optionTarget(obs, option)?.id);
      return `상대가 ${target}에 에너지를 붙였습니다`;
    }
    case 7: {
      const target = optionTarget(obs, option);
      const name = named(target?.id);
      const data = target ? cards.get(target.id) : undefined;
      if (data?.cardType === 0) return `상대가 ${name}을 냈습니다`;
      return `상대가 ${name}을 사용했습니다`;
    }
    case 9:
      return `상대가 ${named(optionTarget(obs, option)?.id)}으로 진화했습니다`;
    case 10:
      return "상대가 특성을 사용했습니다";
    case 11:
      return "상대가 카드를 버렸습니다";
    case 12:
      return "상대가 후퇴했습니다";
    case 13: {
      const attack = option.attackId == null ? undefined : attacks.get(option.attackId);
      return `상대가 ${cleanText(attack?.name || "공격")}으로 공격했습니다`;
    }
    case 14:
      return "상대가 턴을 종료했습니다";
    case 1:
      return "상대가 예를 골랐습니다";
    case 2:
      return "상대가 아니오를 골랐습니다";
    default: {
      const label = optionLabel(obs, option, cards, attacks, mapping);
      return `상대가 ${label}을 골랐습니다`;
    }
  }
}

export function botActionCaption(
  obs: Observation,
  indices: number[],
  catalogs: Catalogs,
  mapping: CardMapping,
): string {
  const select = obs.select;
  if (!select || indices.length === 0) return "상대가 행동했습니다";
  const parts = indices
    .map((index) => select.option[index])
    .filter((option): option is Option => Boolean(option))
    .map((option) => captionOne(obs, option, catalogs.cards, catalogs.attacks, mapping));
  if (parts.length === 0) return "상대가 행동했습니다";
  return parts[0]!;
}

export interface CollectBotTurnArgs {
  humanSeat: number;
  getObservation: () => Observation;
  choose: (obs: Observation) => number[];
  applyChoice: (indices: number[]) => number | null;
  buildView: (obs: Observation) => GameView;
  caption: (obs: Observation, indices: number[]) => string;
  maxSteps?: number;
}

export interface CollectBotTurnResult {
  steps: BotStep[];
  error?: string;
}

export function collectBotTurnSteps(args: CollectBotTurnArgs): CollectBotTurnResult {
  const maxSteps = args.maxSteps ?? 5000;
  const steps: BotStep[] = [];
  let guard = 0;
  while (guard < maxSteps) {
    const obs = args.getObservation();
    if (obs.current.result !== -1 || obs.current.yourIndex === args.humanSeat) {
      return { steps };
    }
    const indices = args.choose(obs);
    const caption = args.caption(obs, indices);
    const error = args.applyChoice(indices);
    if (error) {
      return { steps, error: "봇이 고르지 못했습니다" };
    }
    const next = args.getObservation();
    steps.push({ view: args.buildView(next), caption });
    guard += 1;
  }
  const stuck = args.getObservation();
  if (stuck.current.result === -1 && stuck.current.yourIndex !== args.humanSeat) {
    return { steps, error: "대전이 너무 길어졌습니다" };
  }
  return { steps };
}

export function collectGreedyBotTurn(args: {
  humanSeat: number;
  catalogs: Catalogs;
  mapping: CardMapping;
  getObservation: () => Observation;
  applyChoice: (indices: number[]) => number | null;
  buildView: (obs: Observation) => GameView;
  maxSteps?: number;
}): CollectBotTurnResult {
  return collectBotTurnSteps({
    humanSeat: args.humanSeat,
    getObservation: args.getObservation,
    choose: (obs) => greedyChoice(obs, args.catalogs),
    applyChoice: args.applyChoice,
    buildView: args.buildView,
    caption: (obs, indices) => botActionCaption(obs, indices, args.catalogs, args.mapping),
    maxSteps: args.maxSteps,
  });
}

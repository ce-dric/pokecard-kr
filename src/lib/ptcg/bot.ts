import type { AttackData, CardData, Catalogs, Observation, Option } from "./types.ts";

const MAIN = 0;
const ATTACK = 13;
const END = 14;
const RETREAT = 12;
const DISCARD = 11;
const PLAY = 7;
const ATTACH = 8;
const EVOLVE = 9;
const ABILITY = 10;
const YES = 1;
const NO = 2;
const NUMBER = 0;
const CARD = 3;
const ENERGY = 6;
const TOOL_CARD = 4;
const ENERGY_CARD = 5;
const SKILL = 15;
const SPECIAL = 16;

export function prizeCount(cardId: number | undefined, cards: Map<number, CardData>): number {
  const data = cardId == null ? undefined : cards.get(cardId);
  if (!data) return 1;
  if (data.megaEx) return 3;
  if (data.ex) return 2;
  return 1;
}

export function attackValue(
  obs: Observation,
  attackId: number | undefined,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): number {
  const attack = attackId == null ? undefined : attacks.get(attackId);
  const you = obs.current.yourIndex;
  const defender = obs.current.players[1 - you]?.active?.[0];
  let damage = attack ? attack.damage : 0;
  const attacker = obs.current.players[you]?.active?.[0];
  const attackerData = attacker ? cards.get(attacker.id) : undefined;
  const defenderData = defender ? cards.get(defender.id) : undefined;
  if (
    attackerData &&
    defenderData &&
    defenderData.weakness != null &&
    attackerData.energyType === defenderData.weakness
  ) {
    damage *= 2;
  }
  if (
    attackerData &&
    defenderData &&
    defenderData.resistance != null &&
    attackerData.energyType === defenderData.resistance
  ) {
    damage = Math.max(0, damage - 30);
  }
  const knocksOut = Boolean(defender && defender.hp > 0 && damage >= defender.hp);
  const prizes = defender ? prizeCount(defender.id, cards) : 1;
  return 8000 + damage + (knocksOut ? 100000 * prizes : 0);
}

function handCard(obs: Observation, index: number | undefined) {
  if (index == null) return undefined;
  return obs.current.players[obs.current.yourIndex]?.hand?.[index];
}

export function optionScore(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): number {
  const you = obs.current.yourIndex;
  const me = obs.current.players[you];
  switch (option.type) {
    case ATTACK:
      return attackValue(obs, option.attackId, cards, attacks);
    case END:
      return 120;
    case RETREAT:
      return 40;
    case DISCARD:
      return 80;
    case PLAY: {
      const data = cards.get(handCard(obs, option.index)?.id ?? -1);
      const noActive = !me?.active?.length || !me.active[0];
      if (data?.basic && data.cardType === 0) {
        if (noActive) return 90000;
        if (me && me.bench.length < me.benchMax) return 25000;
        return 500;
      }
      if (data && data.cardType >= 1 && data.cardType <= 4) return 20000;
      return 6000;
    }
    case ATTACH:
      if (obs.current.energyAttached) return 1500;
      return option.inPlayArea === 4 ? 75000 : 65000;
    case EVOLVE:
      return 70000;
    case ABILITY:
      return 45000;
    case YES:
      return 20000;
    case NO:
      return 1000;
    case NUMBER:
      return 3000 + (option.number || 0) * 10;
    case CARD: {
      const context = obs.select?.context;
      if ((context === 13 || context === 14 || context === 15) && option.playerIndex !== you && option.area === 4) {
        return 90000;
      }
      if ((context === 16 || context === 17) && option.playerIndex === you) return 80000;
      const card = option.area === 2 && option.playerIndex === you ? handCard(obs, option.index) : undefined;
      const data = card ? cards.get(card.id) : undefined;
      return 10000 + (data?.hp || 0);
    }
    case ENERGY:
      return 6000 + (option.count || 1);
    case TOOL_CARD:
    case ENERGY_CARD:
      return 4000;
    case SKILL:
      return 5000;
    case SPECIAL:
      return 7000;
    default:
      return 100;
  }
}

export function greedyChoice(obs: Observation, catalogs: Catalogs): number[] {
  const select = obs.select;
  if (!select || select.maxCount <= 0 || select.option.length === 0) return [];
  const ranked = select.option
    .map((option, index) => ({
      index,
      score: optionScore(obs, option, catalogs.cards, catalogs.attacks),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  let count = select.maxCount;
  if (select.type === MAIN || select.maxCount === 1) count = 1;
  else if (select.minCount !== select.maxCount) {
    const useful = ranked.filter((row) => row.score >= 10000).length;
    count = Math.max(select.minCount, Math.min(select.maxCount, useful));
  }
  count = Math.max(select.minCount, Math.min(select.maxCount, count, ranked.length));
  return ranked.slice(0, count).map((row) => row.index);
}

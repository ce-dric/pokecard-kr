import { prizeCount } from "./bot.ts";
import { bestAttackFor, boardPokemon, energiesShort, withExtraEnergy } from "./bot-energy.ts";
import { applyOptionEstimate } from "./bot-lookahead.ts";
import { normalChoice, normalOptionScore } from "./bot-normal.ts";
import { positionScore } from "./bot-position.ts";
import type { AttackData, CardData, Catalogs, Observation, Option, PokemonState } from "./types.ts";

const ATTACK = 13;
const END = 14;
const RETREAT = 12;
const ATTACH = 8;
const CARD = 3;
const TOP_N = 10;

function estimatedDamage(
  attacker: PokemonState | undefined,
  defender: PokemonState | undefined,
  attack: AttackData | undefined,
  cards: Map<number, CardData>,
): number {
  if (!attack) return 0;
  let damage = attack.damage || 0;
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
  return damage;
}

function hardBonus(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): number {
  const you = obs.current.yourIndex;
  const me = obs.current.players[you];
  const opp = obs.current.players[1 - you];
  const defender = opp?.active?.[0];

  switch (option.type) {
    case ATTACK: {
      const attack = option.attackId == null ? undefined : attacks.get(option.attackId);
      const dmg = estimatedDamage(me?.active?.[0], defender, attack, cards);
      let bonus = dmg * 8;
      if (defender && dmg >= defender.hp) {
        bonus += 30000 * prizeCount(defender.id, cards);
      } else if (defender) {
        const left = defender.hp - dmg;
        if (left > 0 && left <= 60) bonus += 4000;
      }
      return bonus;
    }
    case ATTACH: {
      if (obs.current.energyAttached) return 0;
      const target = boardPokemon(me?.active, me?.bench, option.inPlayArea, option.inPlayIndex);
      if (!target) return 0;
      const hand = me?.hand?.[option.index ?? -1];
      const type = hand ? cards.get(hand.id)?.energyType ?? 0 : 0;
      const attack = bestAttackFor(target, cards, attacks);
      const before = energiesShort(target, attack);
      const after = energiesShort(withExtraEnergy(target, type), attack);
      let bonus = 0;
      if (option.inPlayArea === 4 && after === 0 && before > 0) bonus += 12000;
      if (
        option.inPlayArea === 4 &&
        after === 0 &&
        defender &&
        estimatedDamage(withExtraEnergy(target, type), defender, attack, cards) >= defender.hp
      ) {
        bonus += 40000;
      }
      return bonus;
    }
    case RETREAT: {
      for (const poke of me?.bench || []) {
        const attack = bestAttackFor(poke, cards, attacks);
        if (attack && energiesShort(poke, attack) === 0) {
          const dmg = estimatedDamage(poke, defender, attack, cards);
          if (defender && dmg >= defender.hp) return 20000 * prizeCount(defender.id, cards);
          if (dmg >= 100) return 3000;
        }
      }
      return 0;
    }
    case CARD: {
      if (option.playerIndex === you && option.area === 5) {
        const poke = me?.bench?.[option.index ?? -1];
        const attack = bestAttackFor(poke, cards, attacks);
        if (attack && energiesShort(poke, attack) === 0) {
          const dmg = estimatedDamage(poke, defender, attack, cards);
          if (defender && dmg >= defender.hp) return 25000 * prizeCount(defender.id, cards);
          return dmg * 3;
        }
      }
      return 0;
    }
    case END:
      return -80;
    default:
      return 0;
  }
}

export function hardOptionScore(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): number {
  return normalOptionScore(obs, option, cards, attacks) + hardBonus(obs, option, cards, attacks);
}

/**
 * Hard bot: normal heuristic plus KO-seeking bonuses, then a light one-ply
 * observation lookahead on near-ties among the top-N options.
 */
export function hardChoice(obs: Observation, catalogs: Catalogs): number[] {
  const select = obs.select;
  if (!select || select.maxCount <= 0 || select.option.length === 0) return [];

  if (select.maxCount > 1 && select.type !== 0) {
    return normalChoice(obs, catalogs);
  }

  const ranked = select.option
    .map((option, index) => ({
      index,
      score: hardOptionScore(obs, option, catalogs.cards, catalogs.attacks),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  let count = select.maxCount;
  if (select.type === 0 || select.maxCount === 1) count = 1;
  else if (select.minCount !== select.maxCount) {
    const useful = ranked.filter((row) => row.score >= 10000).length;
    count = Math.max(select.minCount, Math.min(select.maxCount, useful));
  }
  count = Math.max(select.minCount, Math.min(select.maxCount, count, ranked.length));
  if (count !== 1) {
    return ranked.slice(0, count).map((row) => row.index);
  }

  const candidates = ranked.slice(0, Math.min(TOP_N, ranked.length));
  if (candidates.length <= 1) return [candidates[0]!.index];

  const leader = candidates[0]!.score;
  const close = candidates.filter((row) => row.score >= leader * 0.92 || leader - row.score <= 5000);
  if (close.length <= 1) return [candidates[0]!.index];

  const rootScore = positionScore(obs);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestIndex = close[0]!.index;
  for (const row of close) {
    const option = select.option[row.index];
    if (!option) continue;
    const child = applyOptionEstimate(obs, option, catalogs.cards, catalogs.attacks);
    const delta = positionScore(child) - rootScore;
    const score = row.score + delta * 25;
    if (score > bestScore || (score === bestScore && row.index < bestIndex)) {
      bestScore = score;
      bestIndex = row.index;
    }
  }
  return [bestIndex];
}

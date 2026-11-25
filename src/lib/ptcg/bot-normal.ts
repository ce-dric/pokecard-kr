import { attackValue, optionScore, prizeCount } from "./bot.ts";
import { bestAttackFor, boardPokemon, energiesShort, withExtraEnergy } from "./bot-energy.ts";
import type { AttackData, CardData, Catalogs, Observation, Option, PokemonState } from "./types.ts";

const MAIN = 0;
const ATTACK = 13;
const END = 14;
const RETREAT = 12;
const PLAY = 7;
const ATTACH = 8;
const EVOLVE = 9;
const ABILITY = 10;
const YES = 1;
const NO = 2;
const CARD = 3;

function handCard(obs: Observation, index: number | undefined) {
  if (index == null) return undefined;
  return obs.current.players[obs.current.yourIndex]?.hand?.[index];
}

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

function canKnockOut(
  attacker: PokemonState | undefined,
  defender: PokemonState | undefined,
  attack: AttackData | undefined,
  cards: Map<number, CardData>,
): boolean {
  if (!defender || !attack) return false;
  return defender.hp > 0 && estimatedDamage(attacker, defender, attack, cards) >= defender.hp;
}

function usableAttack(
  pokemon: PokemonState | undefined,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): AttackData | undefined {
  if (!pokemon) return undefined;
  const data = cards.get(pokemon.id);
  if (!data?.attacks?.length) return undefined;
  let best: AttackData | undefined;
  for (const attackId of data.attacks) {
    const attack = attacks.get(attackId);
    if (!attack) continue;
    if (energiesShort(pokemon, attack) > 0) continue;
    if (!best || (attack.damage || 0) > (best.damage || 0)) best = attack;
  }
  return best;
}

export function normalOptionScore(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): number {
  const base = optionScore(obs, option, cards, attacks);
  const you = obs.current.yourIndex;
  const me = obs.current.players[you];
  const opp = obs.current.players[1 - you];
  const defender = opp?.active?.[0];

  switch (option.type) {
    case ATTACH: {
      if (obs.current.energyAttached) return Math.min(base, 1500);
      const target = boardPokemon(me?.active, me?.bench, option.inPlayArea, option.inPlayIndex);
      if (!target) return base;
      const energyCard = handCard(obs, option.index);
      const energyType = energyCard ? cards.get(energyCard.id)?.energyType ?? 0 : 0;
      const attack = bestAttackFor(target, cards, attacks);
      const before = energiesShort(target, attack);
      const after = energiesShort(withExtraEnergy(target, energyType), attack);
      const isActive = option.inPlayArea === 4;
      // Start from the easy active/bench preference, then reward setup.
      let score = isActive ? 76000 : 64000;
      score += Math.max(0, 8 - Math.min(before, 8)) * 2500;
      if (after < before) score += 12000;
      if (after === 0 && before > 0) {
        score += 30000;
        if (isActive && canKnockOut(withExtraEnergy(target, energyType), defender, attack, cards)) {
          score += 100000;
        }
      }
      // Do not dump energy onto an active that already attacks unless it enables a KO.
      if (before === 0 && isActive && !canKnockOut(withExtraEnergy(target, energyType), defender, attack, cards)) {
        score -= 25000;
      }
      return score;
    }
    case ATTACK: {
      const value = attackValue(obs, option.attackId, cards, attacks);
      const attack = option.attackId == null ? undefined : attacks.get(option.attackId);
      if (canKnockOut(me?.active?.[0], defender, attack, cards)) return value + 8000;
      return value + Math.min(attack?.damage || 0, 200);
    }
    case RETREAT: {
      const active = me?.active?.[0];
      const activeAttack = usableAttack(active, cards, attacks);
      if (canKnockOut(active, defender, activeAttack, cards)) return 15;
      let bestBench = 0;
      for (const poke of me?.bench || []) {
        const attack = usableAttack(poke, cards, attacks);
        if (!attack) continue;
        let score = 8000 + (attack.damage || 0);
        if (canKnockOut(poke, defender, attack, cards)) {
          score += 95000 * prizeCount(defender?.id, cards);
        }
        if (score > bestBench) bestBench = score;
      }
      return bestBench > 0 ? bestBench : base;
    }
    case PLAY: {
      const data = cards.get(handCard(obs, option.index)?.id ?? -1);
      if (data && data.cardType >= 1 && data.cardType <= 4) {
        if ((me?.deckCount ?? 99) <= 3) return 50;
        // Keep trainers strong, but below energy/evolution setup.
        if (data.cardType === 3) return 19500;
        if (data.cardType === 1) return 19000;
        return 18500;
      }
      return base;
    }
    case EVOLVE: {
      const target = boardPokemon(me?.active, me?.bench, option.inPlayArea, option.inPlayIndex);
      const evo = handCard(obs, option.index);
      const fromHp = target?.maxHp || 0;
      const toData = evo ? cards.get(evo.id) : undefined;
      const gain = Math.max(0, (toData?.hp || 0) - fromHp);
      const isActive = option.inPlayArea === 4;
      return 72000 + gain * 40 + (isActive ? 5000 : 0);
    }
    case ABILITY: {
      // Still useful, but not ahead of energy that enables a KO.
      return 42000;
    }
    case YES: {
      if ((me?.deckCount ?? 99) <= 2) return 400;
      return base;
    }
    case NO: {
      if ((me?.deckCount ?? 99) <= 2) return 18000;
      return base;
    }
    case CARD: {
      const context = obs.select?.context;
      if ((context === 13 || context === 14 || context === 15) && option.playerIndex !== you && option.area === 4) {
        return 90000;
      }
      if (option.playerIndex === you && option.area === 5) {
        const poke = me?.bench?.[option.index ?? -1];
        const attack = usableAttack(poke, cards, attacks);
        let score = 50000 + (poke?.hp || 0);
        if (attack) score += 25000 + (attack.damage || 0);
        if (canKnockOut(poke, defender, attack, cards)) {
          score += 95000 * prizeCount(defender?.id, cards);
        }
        return score;
      }
      return base;
    }
    case END:
      return 120;
    default:
      return base;
  }
}

export function normalChoice(obs: Observation, catalogs: Catalogs): number[] {
  const select = obs.select;
  if (!select || select.maxCount <= 0 || select.option.length === 0) return [];
  const ranked = select.option
    .map((option, index) => ({
      index,
      score: normalOptionScore(obs, option, catalogs.cards, catalogs.attacks),
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

export function rankNormalOptions(
  obs: Observation,
  catalogs: Catalogs,
): { index: number; score: number }[] {
  const select = obs.select;
  if (!select) return [];
  return select.option
    .map((option, index) => ({
      index,
      score: normalOptionScore(obs, option, catalogs.cards, catalogs.attacks),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

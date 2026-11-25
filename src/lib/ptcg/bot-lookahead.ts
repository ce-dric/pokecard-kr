import { prizeCount } from "./bot.ts";
import { boardPokemon } from "./bot-energy.ts";
import type { AttackData, CardData, Observation, Option, PokemonState } from "./types.ts";

function cloneObs(obs: Observation): Observation {
  return structuredClone(obs);
}

function handCard(obs: Observation, index: number | undefined) {
  if (index == null) return undefined;
  return obs.current.players[obs.current.yourIndex]?.hand?.[index];
}

function removeHandAt(obs: Observation, index: number | undefined): void {
  const me = obs.current.players[obs.current.yourIndex];
  if (!me?.hand || index == null || index < 0 || index >= me.hand.length) return;
  me.hand.splice(index, 1);
  me.handCount = me.hand.length;
}

/**
 * Apply a rough, deterministic estimate of what an option does to a cloned
 * observation so hard mode can score the resulting position without the WASM
 * search API (which needs hidden-zone card IDs we do not have).
 */
export function applyOptionEstimate(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
): Observation {
  const next = cloneObs(obs);
  const you = next.current.yourIndex;
  const me = next.current.players[you];
  const opp = next.current.players[1 - you];
  if (!me || !opp) return next;

  switch (option.type) {
    case 13: {
      const attack = option.attackId == null ? undefined : attacks.get(option.attackId);
      let dmg = attack?.damage || 0;
      const attacker = me.active?.[0];
      const defender = opp.active?.[0];
      const attackerData = attacker ? cards.get(attacker.id) : undefined;
      const defenderData = defender ? cards.get(defender.id) : undefined;
      if (
        attackerData &&
        defenderData &&
        defenderData.weakness != null &&
        attackerData.energyType === defenderData.weakness
      ) {
        dmg *= 2;
      }
      if (
        attackerData &&
        defenderData &&
        defenderData.resistance != null &&
        attackerData.energyType === defenderData.resistance
      ) {
        dmg = Math.max(0, dmg - 30);
      }
      if (defender) {
        defender.hp = Math.max(0, defender.hp - dmg);
        if (defender.hp <= 0) {
          const prizes = prizeCount(defender.id, cards);
          me.prize = me.prize.slice(0, Math.max(0, me.prize.length - prizes));
          opp.active = [];
          // Winning by taking the last prizes.
          if (me.prize.length === 0) next.current.result = you;
        }
      }
      next.select = null;
      break;
    }
    case 8: {
      const target = boardPokemon(me.active, me.bench, option.inPlayArea, option.inPlayIndex);
      const energy = handCard(next, option.index);
      if (target && energy) {
        const energyType = cards.get(energy.id)?.energyType ?? 0;
        target.energies = [...(target.energies || []), energyType];
        removeHandAt(next, option.index);
        next.current.energyAttached = true;
      }
      break;
    }
    case 7: {
      const card = handCard(next, option.index);
      const data = card ? cards.get(card.id) : undefined;
      if (data?.basic && data.cardType === 0) {
        const poke: PokemonState = {
          id: card!.id,
          serial: card!.serial,
          hp: data.hp,
          maxHp: data.hp,
          energies: [],
        };
        if (!me.active?.length || !me.active[0]) me.active = [poke];
        else if (me.bench.length < me.benchMax) me.bench.push(poke);
        removeHandAt(next, option.index);
      } else if (data && data.cardType >= 1 && data.cardType <= 4) {
        removeHandAt(next, option.index);
        // Optimistic trainer value: draw for supporters, small board boost otherwise.
        if (me.deckCount > 0 && (data.cardType === 3 || data.cardType === 1)) {
          const draw = data.cardType === 3 ? 3 : 1;
          const take = Math.min(draw, me.deckCount);
          me.deckCount -= take;
          me.handCount += take;
          me.hand = me.hand || [];
          for (let i = 0; i < take; i += 1) me.hand.push({ id: 0, serial: -1 - i });
        }
      }
      break;
    }
    case 9: {
      const target = boardPokemon(me.active, me.bench, option.inPlayArea, option.inPlayIndex);
      const evo = handCard(next, option.index);
      const toData = evo ? cards.get(evo.id) : undefined;
      if (target && toData) {
        const damage = Math.max(0, (target.maxHp || 0) - (target.hp || 0));
        target.id = evo!.id;
        target.maxHp = toData.hp;
        target.hp = Math.max(0, toData.hp - damage);
        removeHandAt(next, option.index);
      }
      break;
    }
    case 12: {
      // Retreat: move active to bench; promote best-looking bench later via CARD.
      const active = me.active?.[0];
      if (active && me.bench.length) {
        me.bench.push(active);
        me.active = [me.bench.shift()!];
      }
      break;
    }
    case 3: {
      if (option.playerIndex === you && option.area === 5) {
        const poke = me.bench?.[option.index ?? -1];
        const active = me.active?.[0];
        if (poke && active) {
          me.bench[option.index!] = active;
          me.active = [poke];
        } else if (poke && !active) {
          me.active = [poke];
          me.bench.splice(option.index!, 1);
        }
      }
      break;
    }
    case 14:
      next.select = null;
      break;
    default:
      break;
  }
  return next;
}

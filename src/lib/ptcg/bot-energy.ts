import type { AttackData, CardData, PokemonState } from "./types.ts";

/** Colorless energy type index in the engine catalogs. */
export const COLORLESS_ENERGY = 0;

/**
 * How many more energy attachments this Pokémon needs before it can pay for
 * the attack. Returns a large number when the attack is unknown.
 */
export function energiesShort(
  pokemon: PokemonState | null | undefined,
  attack: AttackData | undefined,
): number {
  if (!attack) return 999;
  if (!attack.energies?.length) return 0;
  if (!pokemon) return attack.energies.length;

  const pool = [...(pokemon.energies || [])];
  let missing = 0;
  for (const need of attack.energies) {
    if (need === COLORLESS_ENERGY) continue;
    const at = pool.indexOf(need);
    if (at >= 0) pool.splice(at, 1);
    else missing += 1;
  }
  const colorless = attack.energies.filter((energy) => energy === COLORLESS_ENERGY).length;
  if (pool.length < colorless) missing += colorless - pool.length;
  return missing;
}

export function withExtraEnergy(
  pokemon: PokemonState,
  energyType: number,
): PokemonState {
  return { ...pokemon, energies: [...(pokemon.energies || []), energyType] };
}

export function bestAttackFor(
  pokemon: PokemonState | null | undefined,
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
    if (!best || (attack.damage || 0) > (best.damage || 0)) best = attack;
  }
  return best;
}

export function boardPokemon(
  active: (PokemonState | null)[] | undefined,
  bench: PokemonState[] | undefined,
  inPlayArea: number | undefined,
  inPlayIndex: number | undefined,
): PokemonState | undefined {
  if (inPlayArea === 4) return active?.[inPlayIndex ?? 0] || undefined;
  if (inPlayArea === 5) return bench?.[inPlayIndex ?? 0];
  return undefined;
}

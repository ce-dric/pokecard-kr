import type { Observation } from "./types.ts";

function prizeLeft(player: Observation["current"]["players"][number] | undefined): number {
  return player?.prize?.length || 0;
}

function boardHp(player: Observation["current"]["players"][number] | undefined): number {
  if (!player) return 0;
  const active = player.active?.[0]?.hp || 0;
  return active + player.bench.reduce((sum, poke) => sum + (poke.hp || 0), 0);
}

function boardEnergy(player: Observation["current"]["players"][number] | undefined): number {
  if (!player) return 0;
  const active = player.active?.[0]?.energies?.length || 0;
  return active + player.bench.reduce((sum, poke) => sum + (poke.energies?.length || 0), 0);
}

/**
 * Higher is better for the player about to act (`yourIndex`).
 * Weights follow issue #74: prize diff, HP diff, energy on board, hand size.
 */
export function positionScore(obs: Observation): number {
  const you = obs.current.yourIndex;
  const me = obs.current.players[you];
  const opp = obs.current.players[1 - you];
  const result = obs.current.result;

  if (result === you) return 1_000_000_000;
  if (result === 1 - you) return -1_000_000_000;
  if (result === 2) return -10_000_000;

  const myPrize = prizeLeft(me);
  const oppPrize = prizeLeft(opp);
  // Fewer prizes left means closer to winning.
  const prizeTerm = (oppPrize - myPrize) * 100_000;
  const hpTerm = (boardHp(me) - boardHp(opp)) * 10;
  const energyTerm = boardEnergy(me) * 120 + (me?.active?.[0]?.energies?.length || 0) * 200;
  const handTerm = (me?.handCount ?? me?.hand?.length ?? 0) * 40;
  const deckTerm = Math.min(me?.deckCount ?? 0, 10) * 15;
  const oppActiveHp = opp?.active?.[0]?.hp ?? 0;
  const pressure = oppActiveHp > 0 ? Math.max(0, 300 - oppActiveHp) * 20 : 5000;
  return prizeTerm + hpTerm + energyTerm + handTerm + deckTerm + pressure;
}

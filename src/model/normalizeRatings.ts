import type { Player } from "../types";

const SKILLS = ["scoring", "shooting", "playmaking", "defense", "rebounding", "stamina"] as const;

function clampRating(value: number): number {
  return Math.min(10, Math.max(1, value));
}

function centeredValues(values: number[]): number[] {
  if (!values.length) return values;
  const originalMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let normalized = values.map((value) => clampRating(value - originalMean + 5));
  // Recenter after clamping so the group remains at 5 unless every value is pinned at a boundary.
  for (let pass = 0; pass < 4; pass += 1) {
    const mean = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
    const correction = 5 - mean;
    if (Math.abs(correction) < 0.0001) break;
    const adjustable = normalized.map((value, index) => ({ value, index })).filter(({ value }) =>
      correction > 0 ? value < 10 : value > 1);
    if (!adjustable.length) break;
    const perPlayer = correction * normalized.length / adjustable.length;
    normalized = normalized.map((value, index) =>
      adjustable.some((item) => item.index === index) ? clampRating(value + perPlayer) : value);
  }
  return normalized.map((value) => Number(value.toFixed(3)));
}

export function normalizePlayers(players: Player[]): Player[] {
  if (!players.length) return players;
  const normalizedBySkill = Object.fromEntries(SKILLS.map((skill) => [
    skill,
    centeredValues(players.map((player) => Number.isFinite(player[skill]) ? player[skill] : 5)),
  ])) as Record<(typeof SKILLS)[number], number[]>;

  return players.map((player, index) => {
    const scoring = normalizedBySkill.scoring[index];
    const shooting = normalizedBySkill.shooting[index];
    const playmaking = normalizedBySkill.playmaking[index];
    const defense = normalizedBySkill.defense[index];
    const rebounding = normalizedBySkill.rebounding[index];
    const stamina = normalizedBySkill.stamina[index];
    const overall = (scoring + shooting + playmaking + defense + rebounding + stamina) / 6;
    return {
      ...player,
      scoring, shooting, playmaking, defense, rebounding, stamina,
      overall,
      modelOverall: overall * 0.35 + scoring * 0.2 + shooting * 0.1 + playmaking * 0.1 + defense * 0.15 + rebounding * 0.07 + stamina * 0.03,
      modelOffense: scoring * 0.45 + shooting * 0.25 + playmaking * 0.2 + overall * 0.1,
      modelDefense: defense * 0.6 + rebounding * 0.25 + stamina * 0.15,
      propUsage: (scoring + playmaking) / 20,
      volatility: player.confidence === "High" ? 0.8 : player.confidence === "Low" ? 1.25 : 1,
    };
  });
}

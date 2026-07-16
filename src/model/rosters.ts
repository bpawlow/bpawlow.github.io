import type { Assignment, GameId, Scenario, TeamId } from "../types";

export function effectiveAssignments(assignments: Assignment[], scenario: Scenario, gameId?: GameId): Assignment[] {
  const defaults = assignments.filter((item) => item.scenario === scenario && !item.gameId);
  if (!gameId) return defaults;
  const overrides = assignments.filter((item) => item.scenario === scenario && item.gameId === gameId);
  const overriddenPlayers = new Set(overrides.map((item) => item.playerId));
  return [...defaults.filter((item) => !overriddenPlayers.has(item.playerId)), ...overrides];
}

export function assignmentsForTeam(
  assignments: Assignment[],
  scenario: Scenario,
  teamId: TeamId,
  gameId?: GameId,
): Assignment[] {
  return effectiveAssignments(assignments, scenario, gameId).filter((item) => item.teamId === teamId);
}

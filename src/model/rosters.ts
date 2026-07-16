import type { Assignment, GameId, Scenario, TeamId } from "../types";

export function assignmentsForTeam(
  assignments: Assignment[],
  scenario: Scenario,
  teamId: TeamId,
  gameId?: GameId,
): Assignment[] {
  const specific = gameId ? assignments.filter((item) => item.scenario === scenario && item.gameId === gameId && item.teamId === teamId) : [];
  if (specific.length) return specific;
  return assignments.filter((item) => item.scenario === scenario && !item.gameId && item.teamId === teamId);
}

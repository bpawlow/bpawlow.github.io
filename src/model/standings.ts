import { GAMES } from "../types";
import type { GameDefinition, GameId, GameResult, TeamId } from "../types";

export interface Standing {
  teamId: TeamId;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  rank: number;
}

export function calculateStandings(results: Record<GameId, GameResult>, games: GameDefinition[] = GAMES): Standing[] {
  const table = new Map<TeamId, Omit<Standing, "rank">>();
  for (const teamId of ["Team A", "Team B", "Team C"] as const) {
    table.set(teamId, { teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, differential: 0 });
  }
  for (const game of games.filter((item) => item.countsTowardStandings)) {
    const result = results[game.id];
    if (!result.final || result.team1Score === null || result.team2Score === null) continue;
    const team1 = table.get(game.team1)!;
    const team2 = table.get(game.team2)!;
    team1.pointsFor += result.team1Score;
    team1.pointsAgainst += result.team2Score;
    team2.pointsFor += result.team2Score;
    team2.pointsAgainst += result.team1Score;
    if (result.team1Score > result.team2Score) { team1.wins += 1; team2.losses += 1; }
    else { team2.wins += 1; team1.losses += 1; }
  }
  for (const standing of table.values()) standing.differential = standing.pointsFor - standing.pointsAgainst;
  return [...table.values()]
    .sort((a, b) => b.wins - a.wins || b.differential - a.differential || b.pointsFor - a.pointsFor || a.teamId.localeCompare(b.teamId))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

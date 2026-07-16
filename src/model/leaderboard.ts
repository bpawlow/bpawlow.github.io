import type { Scenario, SharedBoxScore } from "../types";

export interface PlayerLeaderboardRow {
  playerId: string;
  name: string;
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
  pra: number;
}

export function playerLeaderboard(boxScores: SharedBoxScore[], scenario: Scenario): PlayerLeaderboardRow[] {
  const players = new Map<string, PlayerLeaderboardRow>();
  for (const box of boxScores.filter((row) => row.scenario === scenario && row.played)) {
    const current = players.get(box.playerId) ?? {
      playerId: box.playerId, name: box.playerName, games: 0, points: 0, rebounds: 0, assists: 0, threes: 0, pra: 0,
    };
    current.games += 1;
    current.points += box.points;
    current.rebounds += box.rebounds;
    current.assists += box.assists;
    current.threes += box.threes;
    current.pra = current.points + current.rebounds + current.assists;
    players.set(box.playerId, current);
  }
  return [...players.values()].sort((left, right) => right.pra - left.pra || right.points - left.points || left.name.localeCompare(right.name));
}

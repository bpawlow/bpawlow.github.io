import { describe, expect, it } from "vitest";
import type { SharedBoxScore } from "../types";
import { playerLeaderboard } from "./leaderboard";

const box = (gameId: string, playerId: string, playerName: string, points: number, rebounds: number, assists: number, played = true): SharedBoxScore => ({
  gameId, scenario: "Brad Out", playerId, playerName, teamId: "Team A", played, points, rebounds, assists, threes: 1,
});

describe("player leaderboard", () => {
  it("aggregates played box scores and ranks by PRA", () => {
    const rows = playerLeaderboard([
      box("game-1", "alex", "Alex", 8, 3, 2),
      box("game-2", "alex", "Alex", 4, 2, 1),
      box("game-1", "peter", "Peter", 6, 6, 0),
      box("game-1", "josh", "Josh", 30, 30, 30, false),
    ], "Brad Out");
    expect(rows.map((row) => row.name)).toEqual(["Alex", "Peter"]);
    expect(rows[0]).toMatchObject({ games: 2, points: 12, rebounds: 5, assists: 3, pra: 20 });
  });

  it("does not mix Brad-playing and Brad-out box scores", () => {
    const rows = playerLeaderboard([
      box("game-1", "alex", "Alex", 8, 3, 2),
      { ...box("game-1", "alex", "Alex", 20, 0, 0), scenario: "Brad Plays" },
    ], "Brad Out");
    expect(rows[0].points).toBe(8);
  });
});

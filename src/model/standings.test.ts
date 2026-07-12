import { describe, expect, it } from "vitest";
import { initialState } from "../data/persistence";
import { calculateStandings } from "./standings";

describe("standings", () => {
  it("breaks a three-way tie by differential and then points scored", () => {
    const results = initialState().results;
    results["game-1"] = { gameId: "game-1", team1Score: 21, team2Score: 10, final: true, playerStats: {} };
    results["game-2"] = { gameId: "game-2", team1Score: 21, team2Score: 19, final: true, playerStats: {} };
    results["game-3"] = { gameId: "game-3", team1Score: 21, team2Score: 18, final: true, playerStats: {} };
    const standings = calculateStandings(results);
    expect(standings.map((row) => row.wins)).toEqual([1, 1, 1]);
    expect(standings[0].teamId).toBe("Team A");
    expect(standings[0].differential).toBe(8);
  });
});

import { describe, expect, it } from "vitest";
import type { Assignment } from "../types";
import { assignmentsForTeam } from "./rosters";

const assignment = (playerName: string, teamId: "Team A" | "Team B", gameId?: string): Assignment => ({
  playerId: playerName.toLowerCase(), playerName, scenario: "Brad Out", teamId, gameId, rotationShare: 1, notes: "",
});

describe("roster assignments", () => {
  it("supports a last-minute player move without changing player identity", () => {
    const assignments = [assignment("Alex", "Team A"), assignment("Peter", "Team A"), assignment("Peter", "Team B", "game-2")];
    expect(assignmentsForTeam(assignments, "Brad Out", "Team B", "game-2").map((row) => row.playerName)).toEqual(["Peter"]);
  });

  it("falls back to the default roster when a game has no override", () => {
    const assignments = [assignment("Alex", "Team A")];
    expect(assignmentsForTeam(assignments, "Brad Out", "Team A", "game-3").map((row) => row.playerName)).toEqual(["Alex"]);
  });
});

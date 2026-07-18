import { describe, expect, it } from "vitest";
import type { CommunityState } from "../types";
import { beerMatchupsFromCommunity, beerMoneylinesFromCommunity, gamesFromSchedule, modelConfigFromCommunity, resultsFromCommunity, sharedTickets } from "./sharedApi";

const community: CommunityState = {
  config: { BRAD_PLAYS: false }, loadedAt: "2026-01-01", participants: ["Ben"],
  players: [], assignments: [],
  schedule: [
    { gameId: "game-1", team1: "Team A", team2: "Team B", bye: "Team C", status: "FINAL", team1Score: 21, team2Score: 17, final: true, bettingLocked: true, updatedAt: "" },
    { gameId: "game-2", team1: "Team B", team2: "Team C", bye: "Team A", status: "UPCOMING", team1Score: null, team2Score: null, final: false, bettingLocked: false, updatedAt: "" },
    { gameId: "game-3", team1: "Team C", team2: "Team A", bye: "Team B", status: "UPCOMING", team1Score: null, team2Score: null, final: false, bettingLocked: false, updatedAt: "" },
  ],
  boxScores: [{ gameId: "game-1", scenario: "Brad Out", playerId: "alex", playerName: "Alex", teamId: "Team A", played: true, points: 8, rebounds: 4, assists: 2, threes: 2 }],
  bets: [{ betId: "b1", submittedAt: "2026-01-01", bettor: "Ben", stake: 10, decimalOdds: 2, americanOdds: 100, potentialReturn: 20, scenario: "Brad Out", status: "pending", settledReturn: 0, profit: 0, modelVersion: 2, eventId: "event" }],
  betLegs: [{ betId: "b1", legNumber: 1, gameId: "game-1", kind: "moneyline", subject: "Winner", side: "team1", label: "Team A", odds: 2 }],
  beerEnabled: false, beerEvents: [], beerMatchups: [], beerMoneylines: [], beerDieProps: [], beerBets: [], beerBetLegs: [],
};

describe("shared Sheet state", () => {
  it("maps official schedule and box scores to settlement results", () => {
    const results = resultsFromCommunity(community)!;
    expect(results["game-1"].team1Score).toBe(21);
    expect(results["game-1"].playerStats.alex.points).toBe(8);
  });

  it("uses the Brad-playing scenario when the central toggle is enabled", () => {
    const alternate = {
      ...community,
      config: { BRAD_PLAYS: true },
      boxScores: [{ ...community.boxScores[0], scenario: "Brad Plays" as const, points: 12 }],
    };
    const results = resultsFromCommunity(alternate)!;
    expect(results["game-1"].playerStats.alex.points).toBe(12);
  });

  it("reconstructs immutable ticket snapshots", () => {
    const tickets = sharedTickets(community);
    expect(tickets[0].participant).toBe("Ben");
    expect(tickets[0].legs[0].gameId).toBe("game-1");
    expect(tickets[0].centralized).toBe(true);
  });

  it("keeps the basketball and Beer ledgers isolated", () => {
    const beerBet = { ...community.bets[0], betId: "beer-b1" };
    const beerLeg = { ...community.betLegs[0], betId: "beer-b1", gameId: "beer-die-matchup-1", competition: "beer-olympics" as const };
    const mixed = { ...community, beerBets: [beerBet], beerBetLegs: [beerLeg] };
    expect(sharedTickets(mixed, "basketball").map((ticket) => ticket.id)).toEqual(["b1"]);
    expect(sharedTickets(mixed, "beer-olympics").map((ticket) => ticket.id)).toEqual(["beer-b1"]);
  });

  it("maps added schedule rows and optional byes into game definitions", () => {
    const games = gamesFromSchedule([
      { gameId: "game-4", number: 4, type: "EXHIBITION", team1Id: "Team A", team1: "Team A", team2Id: "Team C", team2: "Team C", byeId: null, bye: "", countsTowardStandings: false, bettingEnabled: true, status: "UPCOMING", team1Score: null, team2Score: null, final: false, bettingLocked: false, updatedAt: "" },
    ]);
    expect(games[0]).toMatchObject({ id: "game-4", type: "EXHIBITION", team1: "Team A", team2: "Team C", bye: null, countsTowardStandings: false });
  });

  it("uses the calibrated player-prop defaults when config rows are missing", () => {
    expect(modelConfigFromCommunity(community)).toMatchObject({
      scoringUsageWeight: 0.65,
      assistRoleExponent: 2.2,
      assistRoleWeight: 1.4,
      reboundRoleExponent: 1.9,
      reboundRoleWeight: 1.35,
    });
  });

  it("uses configured display names for Beer matchup headers and odds labels", () => {
    const configured = {
      ...community,
      config: { ...community.config, TEAM_A_NAME: "The Sharks", TEAM_B_NAME: "The Beers", TEAM_C_NAME: "The Boats" },
      beerMatchups: [{ matchupId: "beer-kayak-matchup-1", eventId: "beer-kayak", eventNumber: 1, sequence: 1, team1Id: "Team A" as const, team2Id: "Team B" as const, team1: "Team A", team2: "Team B", status: "UPCOMING" as const, bettingEnabled: true, bettingLocked: false, countsTowardStandings: true, winnerTeamId: null, team1Score: "", team2Score: "", final: false, updatedAt: "", notes: "" }],
      beerMoneylines: [{ matchupId: "beer-kayak-matchup-1", teamId: "Team A" as const, teamName: "Team A", americanOdds: 100, bettingEnabled: true, notes: "" }],
    };
    expect(beerMatchupsFromCommunity(configured)[0]).toMatchObject({ team1: "The Sharks", team2: "The Beers" });
    expect(beerMoneylinesFromCommunity(configured)[0]).toMatchObject({ teamName: "The Sharks" });
  });
});

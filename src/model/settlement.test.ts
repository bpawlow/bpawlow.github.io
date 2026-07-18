import { describe, expect, it } from "vitest";
import type { PersistedState, Ticket } from "../types";
import { initialState } from "../data/persistence";
import { canStake, gradeLeg, ledger, settleTicket } from "./settlement";

function finalResults(): PersistedState["results"] {
  const results = initialState().results;
  results["game-1"] = {
    gameId: "game-1", team1Score: 21, team2Score: 17, final: true,
    playerStats: { alex: { playerId: "alex", points: 8, rebounds: 5, assists: 3, threes: 2 } },
  };
  return results;
}

const baseTicket: Ticket = {
  id: "ticket", createdAt: "2026-01-01", participant: "Test", scenario: "Brad Out", stake: 10,
  decimalOdds: 2, americanOdds: 100, potentialReturn: 20, fairProbability: 0.5,
  status: "pending", settledReturn: 0, legs: [],
};

describe("settlement", () => {
  it("grades game lines and combo props", () => {
    const results = finalResults();
    expect(gradeLeg({ marketId: "ml", gameId: "game-1", kind: "moneyline", subject: "Winner", side: "team1", label: "A", odds: 2 }, results)).toBe("win");
    expect(gradeLeg({ marketId: "total", gameId: "game-1", kind: "total", subject: "Total", side: "under", line: 38.5, label: "Under", odds: 2 }, results)).toBe("win");
    expect(gradeLeg({ marketId: "pra", gameId: "game-1", kind: "player-prop", subject: "Alex", playerId: "alex", stat: "pra", side: "over", line: 15.5, label: "Alex PRA", odds: 2 }, results)).toBe("win");
  });

  it("grades Beer moneylines and manually finalized Beer Die props", () => {
    const beerMatchups = [{ matchupId: "beer-die-matchup-1", eventId: "beer-die", eventNumber: 3, sequence: 1, team1Id: "Team A" as const, team2Id: "Team B" as const, team1: "A", team2: "B", status: "FINAL" as const, bettingEnabled: true, bettingLocked: true, countsTowardStandings: true, winnerTeamId: "Team B" as const, team1Score: "", team2Score: "", final: true, updatedAt: "", notes: "" }];
    const beerProps = [{ propId: "corner-cup", matchupId: "beer-die-matchup-1", name: "Corner cup", scope: "team" as const, teamId: "Team A" as const, marketType: "yes-no" as const, line: null, overAmericanOdds: null, underAmericanOdds: null, yesAmericanOdds: 200, noAmericanOdds: -250, actualValue: null, winningSide: "no" as const, bettingEnabled: true, bettingLocked: true, final: true, notes: "" }];
    expect(gradeLeg({ marketId: "beer-ml", gameId: "beer-die-matchup-1", competition: "beer-olympics", kind: "moneyline", subject: "B", teamId: "Team B", side: "team2", label: "B", odds: 2 }, {}, [], beerMatchups, beerProps)).toBe("win");
    expect(gradeLeg({ marketId: "beer-prop", gameId: "beer-die-matchup-1", competition: "beer-olympics", kind: "beer-prop", subject: "Corner cup", propId: "corner-cup", teamId: "Team A", side: "no", label: "No", odds: 1.4 }, {}, [], beerMatchups, beerProps)).toBe("win");
  });

  it("settles a winning ticket and rebuilds the bankroll", () => {
    const ticket = settleTicket({ ...baseTicket, legs: [{ marketId: "ml", gameId: "game-1", kind: "moneyline", subject: "Winner", side: "team1", label: "A", odds: 2 }] }, finalResults());
    expect(ticket.status).toBe("won");
    expect(ledger([ticket])).toEqual({ available: 110, totalStaked: 10, returns: 20, profit: 10 });
  });

  it("rejects a stake that would overdraw the available units", () => {
    expect(canStake(0, 0.1)).toBe(false);
    expect(canStake(25, 25)).toBe(true);
    expect(canStake(25, 25.01)).toBe(false);
    expect(canStake(25, -1)).toBe(false);
  });

  it("replenishes an empty ledger without changing the other competition ledger", () => {
    const basketball = settleTicket({ ...baseTicket, id: "basketball-ticket", legs: [{ marketId: "ml", gameId: "game-1", kind: "moneyline", subject: "Winner", side: "team1", label: "A", odds: 2 }] }, finalResults());
    expect(ledger([basketball])).toEqual({ available: 110, totalStaked: 10, returns: 20, profit: 10 });
    expect(ledger([])).toEqual({ available: 100, totalStaked: 0, returns: 0, profit: 0 });
  });
});

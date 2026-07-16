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
});

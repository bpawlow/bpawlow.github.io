import { describe, expect, it } from "vitest";
import { beerMarkets, calculateBeerStandings } from "./beer";
import type { BeerDieProp, BeerMatchup, BeerMoneyline } from "../types";

const matchup: BeerMatchup = {
  matchupId: "beer-die-matchup-1", eventId: "beer-die", eventNumber: 3, sequence: 7,
  team1Id: "Team A", team2Id: "Team B", team1: "Aces", team2: "Bruisers", status: "UPCOMING",
  bettingEnabled: true, bettingLocked: false, countsTowardStandings: true, winnerTeamId: null,
  team1Score: "", team2Score: "", final: false, updatedAt: "", notes: "",
};

describe("Beer Olympics markets and standings", () => {
  it("turns manual moneylines and Beer Die props into selectable markets", () => {
    const moneylines: BeerMoneyline[] = [
      { matchupId: matchup.matchupId, teamId: "Team A", teamName: "Aces", americanOdds: -120, bettingEnabled: true, notes: "" },
      { matchupId: matchup.matchupId, teamId: "Team B", teamName: "Bruisers", americanOdds: 100, bettingEnabled: true, notes: "" },
    ];
    const props: BeerDieProp[] = [{
      propId: "corner-cup", matchupId: matchup.matchupId, name: "Corner cup", scope: "team", teamId: "Team A", marketType: "yes-no", line: null,
      overAmericanOdds: null, underAmericanOdds: null, yesAmericanOdds: 250, noAmericanOdds: -300, actualValue: null, winningSide: null,
      bettingEnabled: true, bettingLocked: false, final: false, notes: "",
    }];
    const markets = beerMarkets([matchup], moneylines, props);
    expect(markets).toHaveLength(4);
    expect(markets.find((market) => market.side === "yes")?.americanOdds).toBe(250);
    expect(markets.find((market) => market.kind === "moneyline" && market.teamId === "Team B")?.decimalOdds).toBe(2);
  });

  it("calculates Beer standings from wins and losses only", () => {
    const final = (id: string, team1: "Team A" | "Team B" | "Team C", team2: "Team A" | "Team B" | "Team C", winner: "Team A" | "Team B" | "Team C"): BeerMatchup => ({ ...matchup, matchupId: id, team1Id: team1, team2Id: team2, winnerTeamId: winner, final: true, team1Score: "999", team2Score: "0" });
    const standings = calculateBeerStandings([final("1", "Team A", "Team B", "Team A"), final("2", "Team B", "Team C", "Team B"), final("3", "Team C", "Team A", "Team C")]);
    expect(standings.map((row) => [row.teamId, row.wins, row.losses])).toEqual([["Team A", 1, 1], ["Team B", 1, 1], ["Team C", 1, 1]]);
  });
});

import { describe, expect, it } from "vitest";
import { hasContradictorySpreadMoneyline } from "./marketGuardrails";
import type { MarketSelection } from "../types";

const market = (kind: MarketSelection["kind"], teamId: "Team A" | "Team B", line?: number): MarketSelection => ({
  id: `${kind}-${teamId}`, groupId: kind, gameId: "game-1", gameNumber: 1, kind, category: "Game lines", subject: kind,
  teamId, side: kind === "moneyline" ? "team1" : "team1", line, label: "", shortLabel: "", fairProbability: 0.5,
  offeredProbability: 0.53, decimalOdds: 1.9, americanOdds: -111,
});

describe("market guardrails", () => {
  it("blocks a favorite spread with the opposing moneyline", () => {
    expect(hasContradictorySpreadMoneyline(market("moneyline", "Team B"), [market("spread", "Team A", -2.5)])).toBe(true);
  });

  it("allows an underdog spread with the opposing moneyline", () => {
    expect(hasContradictorySpreadMoneyline(market("moneyline", "Team A"), [market("spread", "Team B", 2.5)])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { Player } from "../types";
import { normalizePlayers } from "./normalizeRatings";

function player(name: string, value: number): Player {
  return {
    id: name.toLowerCase(), name, active: true, notes: "", overall: value,
    scoring: value, shooting: value, playmaking: value, defense: value, rebounding: value, stamina: value,
    confidence: "Medium", modelOverall: value, modelOffense: value, modelDefense: value, propUsage: 0.5, volatility: 1,
  };
}

describe("automatic ratings normalization", () => {
  it("centers every category at five while preserving rank and gaps", () => {
    const normalized = normalizePlayers([player("A", 9), player("B", 7), player("C", 5)]);
    const mean = normalized.reduce((sum, item) => sum + item.scoring, 0) / normalized.length;
    expect(mean).toBeCloseTo(5, 3);
    expect(normalized[0].scoring).toBeGreaterThan(normalized[1].scoring);
    expect(normalized[0].scoring - normalized[1].scoring).toBeCloseTo(2, 3);
  });

  it("recalculates all model outputs from normalized skills", () => {
    const normalized = normalizePlayers([player("A", 8), player("B", 6), player("C", 4)]);
    expect(normalized[0].overall).toBeCloseTo(normalized[0].scoring);
    expect(normalized[0].propUsage).toBeCloseTo(normalized[0].scoring / 10);
  });
});

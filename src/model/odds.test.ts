import { describe, expect, it } from "vitest";
import { decimalToAmerican, offeredPrice } from "./odds";

describe("odds", () => {
  it("converts decimal prices in both American directions", () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);
  });

  it("adds hold by shortening the fair price", () => {
    const price = offeredPrice(0.5, 0.05);
    expect(price.offeredProbability).toBeCloseTo(0.525);
    expect(price.decimalOdds).toBeCloseTo(1.9048, 3);
  });
});

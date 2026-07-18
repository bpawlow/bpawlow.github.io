import { describe, expect, it } from "vitest";
import { americanToDecimal, decimalToAmerican, manualParlayPrice, offeredPrice } from "./odds";

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

  it("converts manual American odds and compounds manual Beer prices", () => {
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToDecimal(-200)).toBe(1.5);
    expect(manualParlayPrice([2, 1.5]).decimalOdds).toBe(3);
    expect(manualParlayPrice([2, 1.5]).americanOdds).toBe(200);
  });
});

import { describe, expect, it } from "vitest";
import { balancedHalfLine } from "./lineSelection";

describe("balanced prop lines", () => {
  it("chooses the available half-line closest to a 50/50 outcome", () => {
    expect(balancedHalfLine(new Uint8Array([0, 0, 1, 2]), 0.7)).toBe(0.5);
  });

  it("uses the preferred quantile only to break a discrete tie", () => {
    expect(balancedHalfLine(new Uint8Array([0, 0, 2, 2]), 0.8)).toBe(1.5);
  });

  it("keeps zero-production markets on a valid half-point line", () => {
    expect(balancedHalfLine(new Uint8Array([0, 0, 0]))).toBe(0.5);
  });
});

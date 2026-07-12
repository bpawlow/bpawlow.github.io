import { describe, expect, it } from "vitest";
import { parseCsv } from "./googleSheets";

describe("CSV parser", () => {
  it("handles quoted commas, escaped quotes, and newlines", () => {
    expect(parseCsv('name,note\nEric,"scorer, champion"\nBrad,"said ""rusty"""')).toEqual([
      ["name", "note"],
      ["Eric", "scorer, champion"],
      ["Brad", 'said "rusty"'],
    ]);
  });
});

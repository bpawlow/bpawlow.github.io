import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8");

describe("shared Apps Script ledger boundaries", () => {
  it("resets only the Beer ledger", () => {
    const resetFunction = source.slice(source.indexOf("function resetAllBankrolls_"), source.indexOf("function removeParticipantPrompt"));
    expect(resetFunction).toContain('["Beer Bet Legs", "Beer Bets"]');
    expect(resetFunction).not.toContain('"Bet Legs"');
    expect(resetFunction).not.toContain('"Bets"');
  });

  it("keeps basketball and Beer leaderboards on separate source sheets", () => {
    expect(source).toContain('syncLedgerLeaderboard_(config, "Bets", "Betting Leaderboard")');
    expect(source).toContain('syncLedgerLeaderboard_(config, "Beer Bets", "Beer Betting Leaderboard")');
    expect(source).toContain('var betSheetName = hasBeer ? "Beer Bets" : "Bets";');
  });
});

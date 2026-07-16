import type { MarketSelection } from "../types";

export function hasContradictorySpreadMoneyline(selection: MarketSelection, existing: MarketSelection[]): boolean {
  if (selection.kind === "spread" && selection.teamId && (selection.line ?? 0) < 0) {
    return existing.some((market) => market.gameId === selection.gameId && market.kind === "moneyline" && market.teamId && market.teamId !== selection.teamId);
  }
  if (selection.kind === "moneyline" && selection.teamId) {
    return existing.some((market) => market.gameId === selection.gameId && market.kind === "spread" && market.teamId && (market.line ?? 0) < 0 && market.teamId !== selection.teamId);
  }
  return false;
}

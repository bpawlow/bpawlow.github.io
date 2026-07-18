import { americanToDecimal, manualParlayPrice } from "./odds";
import type { BeerDieProp, BeerMatchup, BeerMoneyline, BeerStanding, MarketSelection, TeamId } from "../types";

const TEAMS: TeamId[] = ["Team A", "Team B", "Team C"];

function marketFromOdds(args: {
  id: string;
  groupId: string;
  matchup: BeerMatchup;
  subject: string;
  label: string;
  side: MarketSelection["side"];
  teamId?: TeamId;
  americanOdds: number;
  line?: number;
  kind?: MarketSelection["kind"];
}): MarketSelection {
  const decimalOdds = americanToDecimal(args.americanOdds);
  return {
    id: args.id,
    groupId: args.groupId,
    gameId: args.matchup.matchupId,
    gameNumber: args.matchup.sequence,
    kind: args.kind ?? "moneyline",
    competition: "beer-olympics",
    category: args.kind === "beer-prop" ? "Beer Die props" : "Beer moneylines",
    subject: args.subject,
    propId: args.kind === "beer-prop" ? args.id.split(":beer-prop:")[1]?.split(":")[0] : undefined,
    teamId: args.teamId,
    side: args.side,
    line: args.line,
    label: args.label,
    shortLabel: args.side === "team1" || args.side === "team2" ? args.subject : `${args.side === "over" ? "O" : args.side === "under" ? "U" : args.side === "yes" ? "Yes" : "No"}${args.line === undefined ? "" : ` ${args.line}`}`,
    fairProbability: decimalOdds ? 1 / decimalOdds : 0,
    offeredProbability: decimalOdds ? 1 / decimalOdds : 0,
    decimalOdds,
    americanOdds: args.americanOdds,
  };
}

export function beerMarkets(matchups: BeerMatchup[], moneylines: BeerMoneyline[], props: BeerDieProp[]): MarketSelection[] {
  const matchupMap = new Map(matchups.map((matchup) => [matchup.matchupId, matchup]));
  const markets: MarketSelection[] = [];
  for (const row of moneylines) {
    const matchup = matchupMap.get(row.matchupId);
    if (!matchup || !row.bettingEnabled || row.americanOdds === null || row.americanOdds === 0 || !matchup.bettingEnabled || matchup.bettingLocked) continue;
    const teamName = row.teamId === matchup.team1Id ? matchup.team1 : matchup.team2;
    markets.push(marketFromOdds({
      id: `${row.matchupId}:beer-ml:${row.teamId}`,
      groupId: `${row.matchupId}:beer-ml`,
      matchup,
      subject: teamName,
      label: `${teamName} to win`,
      side: row.teamId === matchup.team1Id ? "team1" : "team2",
      teamId: row.teamId,
      americanOdds: row.americanOdds,
    }));
  }
  for (const prop of props) {
    const matchup = matchupMap.get(prop.matchupId);
    if (!matchup || !prop.bettingEnabled || prop.bettingLocked || !matchup.bettingEnabled) continue;
    const target = prop.teamId ? `${prop.name} · ${prop.teamId === matchup.team1Id ? matchup.team1 : matchup.team2}` : prop.name;
    const base = `${prop.matchupId}:beer-prop:${prop.propId}`;
    if (prop.marketType === "over-under" && prop.line !== null && prop.overAmericanOdds !== null && prop.underAmericanOdds !== null && prop.overAmericanOdds !== 0 && prop.underAmericanOdds !== 0) {
      markets.push(marketFromOdds({ id: `${base}:over`, groupId: base, matchup, subject: target, label: `${target} over ${prop.line}`, side: "over", teamId: prop.teamId ?? undefined, line: prop.line, kind: "beer-prop", americanOdds: prop.overAmericanOdds }));
      markets.push(marketFromOdds({ id: `${base}:under`, groupId: base, matchup, subject: target, label: `${target} under ${prop.line}`, side: "under", teamId: prop.teamId ?? undefined, line: prop.line, kind: "beer-prop", americanOdds: prop.underAmericanOdds }));
    }
    if (prop.marketType === "yes-no" && prop.yesAmericanOdds !== null && prop.noAmericanOdds !== null && prop.yesAmericanOdds !== 0 && prop.noAmericanOdds !== 0) {
      markets.push(marketFromOdds({ id: `${base}:yes`, groupId: base, matchup, subject: target, label: `${target} yes`, side: "yes", teamId: prop.teamId ?? undefined, kind: "beer-prop", americanOdds: prop.yesAmericanOdds }));
      markets.push(marketFromOdds({ id: `${base}:no`, groupId: base, matchup, subject: target, label: `${target} no`, side: "no", teamId: prop.teamId ?? undefined, kind: "beer-prop", americanOdds: prop.noAmericanOdds }));
    }
  }
  return markets;
}

export function calculateBeerStandings(matchups: BeerMatchup[]): BeerStanding[] {
  const table = new Map(TEAMS.map((teamId) => [teamId, { teamId, wins: 0, losses: 0 }]));
  for (const matchup of matchups) {
    if (!matchup.countsTowardStandings || !matchup.final || !matchup.winnerTeamId) continue;
    const winner = table.get(matchup.winnerTeamId);
    const loserId = matchup.winnerTeamId === matchup.team1Id ? matchup.team2Id : matchup.team1Id;
    const loser = table.get(loserId);
    if (winner) winner.wins += 1;
    if (loser) loser.losses += 1;
  }
  return [...table.values()].sort((a, b) => b.wins - a.wins || a.teamId.localeCompare(b.teamId)).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function beerParlayPrice(markets: MarketSelection[]) {
  return manualParlayPrice(markets.map((market) => market.decimalOdds));
}

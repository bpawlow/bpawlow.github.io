import { GAMES } from "../types";
import type { GameDefinition, GameResult, PersistedState, StatKey, Ticket, TicketLeg, TicketStatus } from "../types";

type Grade = "win" | "loss" | "push" | "pending";

function compare(value: number, line: number, side: "over" | "under"): Grade {
  if (value === line) return "push";
  if (side === "over") return value > line ? "win" : "loss";
  return value < line ? "win" : "loss";
}

function playerStat(result: GameResult, playerId: string, stat: StatKey): number | null {
  const box = result.playerStats[playerId];
  if (!box) return null;
  if (stat === "points" || stat === "rebounds" || stat === "assists" || stat === "threes") return box[stat];
  if (stat === "pr") return box.points + box.rebounds;
  if (stat === "pa") return box.points + box.assists;
  if (stat === "ra") return box.rebounds + box.assists;
  return box.points + box.rebounds + box.assists;
}

export function gradeLeg(leg: TicketLeg, results: PersistedState["results"], games: GameDefinition[] = GAMES): Grade {
  const result = results[leg.gameId];
  if (!result?.final || result.team1Score === null || result.team2Score === null) return "pending";
  const game = games.find((candidate) => candidate.id === leg.gameId);
  if (!game) return "pending";
  const score = (team: string) => team === game.team1 ? result.team1Score! : result.team2Score!;

  if (leg.kind === "moneyline") {
    const selectedTeam = leg.side === "team1" ? game.team1 : game.team2;
    return score(selectedTeam) > score(selectedTeam === game.team1 ? game.team2 : game.team1) ? "win" : "loss";
  }
  if (leg.kind === "spread" && leg.teamId && leg.line !== undefined) {
    const opponent = leg.teamId === game.team1 ? game.team2 : game.team1;
    const adjusted = score(leg.teamId) + leg.line;
    if (adjusted === score(opponent)) return "push";
    return adjusted > score(opponent) ? "win" : "loss";
  }
  if (leg.kind === "total" && leg.line !== undefined && (leg.side === "over" || leg.side === "under")) {
    return compare(result.team1Score + result.team2Score, leg.line, leg.side);
  }
  if (leg.kind === "team-total" && leg.teamId && leg.line !== undefined && (leg.side === "over" || leg.side === "under")) {
    return compare(score(leg.teamId), leg.line, leg.side);
  }
  if (leg.kind === "player-prop" && leg.playerId && leg.stat && leg.line !== undefined && (leg.side === "over" || leg.side === "under")) {
    const value = playerStat(result, leg.playerId, leg.stat);
    if (value === null) return "pending";
    return compare(value, leg.line, leg.side);
  }
  return "pending";
}

export function settleTicket(ticket: Ticket, results: PersistedState["results"], games: GameDefinition[] = GAMES): Ticket {
  const grades = ticket.legs.map((leg) => gradeLeg(leg, results, games));
  let status: TicketStatus = "pending";
  let settledReturn = 0;
  if (grades.includes("loss")) status = "lost";
  else if (grades.includes("pending")) status = "pending";
  else if (grades.every((grade) => grade === "push")) {
    status = "push";
    settledReturn = ticket.stake;
  } else {
    status = "won";
    settledReturn = ticket.potentialReturn;
  }
  return { ...ticket, status, settledReturn };
}

export function settleTickets(tickets: Ticket[], results: PersistedState["results"], games: GameDefinition[] = GAMES): Ticket[] {
  return tickets.map((ticket) => settleTicket(ticket, results, games));
}

export function ledger(tickets: Ticket[]): { available: number; totalStaked: number; returns: number; profit: number } {
  const totalStaked = tickets.reduce((sum, ticket) => sum + ticket.stake, 0);
  const returns = tickets.reduce((sum, ticket) => sum + ticket.settledReturn, 0);
  const available = 100 - totalStaked + returns;
  return { available, totalStaked, returns, profit: available - 100 };
}

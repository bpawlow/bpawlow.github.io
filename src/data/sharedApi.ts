import { GAMES } from "../types";
import { normalizePlayers } from "../model/normalizeRatings";
import type {
  CommunityState,
  GameId,
  GameResult,
  PersistedState,
  SharedBet,
  SharedBetLeg,
  Ticket,
} from "../types";

export const DEFAULT_SHARED_API_URL = "https://script.google.com/macros/s/AKfycbzcCsgpK6rPDJ0rCUSKjj454tPzHFkQPhrvmE97QtgqZVzwT5Jj0MrcXxDb3BAMXYxDdQ/exec";

export async function loadCommunityState(apiUrl: string): Promise<CommunityState> {
  const separator = apiUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${apiUrl}${separator}action=state&_=${Date.now()}`, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`Shared Sheet API returned ${response.status}`);
  const payload = await response.json() as CommunityState & { ok?: boolean; error?: string };
  if (payload.ok === false || payload.error) throw new Error(payload.error || "Shared Sheet API failed");
  return {
    ...payload,
    players: normalizePlayers(payload.players ?? []), assignments: payload.assignments ?? [], schedule: payload.schedule ?? [],
    boxScores: payload.boxScores ?? [], bets: payload.bets ?? [], betLegs: payload.betLegs ?? [], participants: payload.participants ?? [],
    loadedAt: new Date().toISOString(),
  };
}

export async function submitSharedTicket(apiUrl: string, ticket: Ticket): Promise<void> {
  const response = await fetch(apiUrl, {
    method: "POST",
    redirect: "follow",
    body: JSON.stringify({ action: "placeBet", ticket }),
  });
  if (!response.ok) throw new Error(`Shared bet submission returned ${response.status}`);
  const payload = await response.json() as { ok: boolean; error?: string };
  if (!payload.ok) throw new Error(payload.error || "The shared Sheet rejected this ticket");
}

export async function registerSharedParticipant(apiUrl: string, participant: string): Promise<string> {
  const response = await fetch(apiUrl, {
    method: "POST",
    redirect: "follow",
    body: JSON.stringify({ action: "registerParticipant", participant }),
  });
  if (!response.ok) throw new Error(`Participant registration returned ${response.status}`);
  const payload = await response.json() as { ok: boolean; participant?: string; error?: string };
  if (!payload.ok || !payload.participant) throw new Error(payload.error || "Participant registration failed");
  return payload.participant;
}

export function resultsFromCommunity(community: CommunityState | null): PersistedState["results"] | null {
  if (!community) return null;
  const scenario = community.config.BRAD_PLAYS === true || String(community.config.BRAD_PLAYS).toUpperCase() === "TRUE" ? "Brad Plays" : "Brad Out";
  const results = {} as PersistedState["results"];
  for (const game of GAMES) {
    const shared = community.schedule.find((row) => row.gameId === game.id);
    const playerStats = Object.fromEntries(
      community.boxScores
        .filter((row) => row.gameId === game.id && row.scenario === scenario && row.played)
        .map((row) => [row.playerId, { playerId: row.playerId, points: row.points, rebounds: row.rebounds, assists: row.assists, threes: row.threes }]),
    );
    results[game.id] = {
      gameId: game.id,
      team1Score: shared?.team1Score ?? null,
      team2Score: shared?.team2Score ?? null,
      final: shared?.final ?? false,
      playerStats,
    } satisfies GameResult;
  }
  return results;
}

export function sharedTickets(community: CommunityState): Ticket[] {
  const legsByBet = new Map<string, SharedBetLeg[]>();
  for (const leg of community.betLegs) legsByBet.set(leg.betId, [...(legsByBet.get(leg.betId) ?? []), leg]);
  return community.bets.map((bet: SharedBet): Ticket => ({
    id: bet.betId,
    createdAt: bet.submittedAt,
    participant: bet.bettor,
    scenario: bet.scenario,
    stake: bet.stake,
    decimalOdds: bet.decimalOdds,
    americanOdds: bet.americanOdds,
    potentialReturn: bet.potentialReturn,
    fairProbability: bet.decimalOdds > 0 ? 1 / bet.decimalOdds : 0,
    status: bet.status,
    settledReturn: bet.settledReturn,
    centralized: true,
    legs: (legsByBet.get(bet.betId) ?? []).sort((a, b) => a.legNumber - b.legNumber).map((leg) => ({
      marketId: `${leg.betId}:${leg.legNumber}`,
      gameId: leg.gameId,
      kind: leg.kind,
      subject: leg.subject,
      playerId: leg.playerId || undefined,
      teamId: leg.teamId || undefined,
      stat: leg.stat || undefined,
      side: leg.side,
      line: leg.line,
      label: leg.label,
      odds: leg.odds,
    })),
  }));
}

export function isGameLocked(community: CommunityState | null, gameId: GameId): boolean {
  return community?.schedule.find((game) => game.gameId === gameId)?.bettingLocked ?? false;
}

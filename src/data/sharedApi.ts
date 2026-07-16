import { DEFAULT_MODEL_CONFIG } from "../types";
import { normalizePlayers } from "../model/normalizeRatings";
import type {
  CommunityState,
  GameId,
  GameResult,
  PersistedState,
  SharedBet,
  SharedBetLeg,
  Ticket,
  GameDefinition,
  ModelConfig,
  TeamId,
} from "../types";

export const DEFAULT_SHARED_API_URL = "https://script.google.com/macros/s/AKfycbzcCsgpK6rPDJ0rCUSKjj454tPzHFkQPhrvmE97QtgqZVzwT5Jj0MrcXxDb3BAMXYxDdQ/exec";

const TEAM_IDS: TeamId[] = ["Team A", "Team B", "Team C"];

function teamIdFromDisplay(value: string, config: CommunityState["config"]): TeamId | null {
  const names: Record<TeamId, string> = {
    "Team A": String(config.TEAM_A_NAME || "Team A"),
    "Team B": String(config.TEAM_B_NAME || "Team B"),
    "Team C": String(config.TEAM_C_NAME || "Team C"),
  };
  return TEAM_IDS.find((team) => team === value || names[team] === value) ?? null;
}

export function gamesFromSchedule(schedule: CommunityState["schedule"], config: CommunityState["config"] = {}): GameDefinition[] {
  return schedule.map((row, index) => ({
    id: row.gameId,
    number: row.number ?? index + 1,
    team1: row.team1Id ?? teamIdFromDisplay(row.team1, config) ?? "Team A",
    team2: row.team2Id ?? teamIdFromDisplay(row.team2, config) ?? "Team B",
    bye: row.byeId ?? (row.bye ? teamIdFromDisplay(row.bye, config) : null),
    type: row.type ?? "TOURNAMENT",
    countsTowardStandings: row.countsTowardStandings ?? true,
    bettingEnabled: row.bettingEnabled ?? true,
  }));
}

function configNumber(config: CommunityState["config"], key: string, fallback: number, min: number, max: number): number {
  const value = Number(config[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function modelConfigFromCommunity(community: CommunityState | null): ModelConfig {
  const config = community?.config ?? {};
  return {
    straightVig: configNumber(config, "STRAIGHT_VIG", DEFAULT_MODEL_CONFIG.straightVig, 0, 0.2),
    parlayBaseVig: configNumber(config, "PARLAY_BASE_VIG", DEFAULT_MODEL_CONFIG.parlayBaseVig, 0, 0.3),
    reboundLineQuantile: configNumber(config, "REBOUND_LINE_QUANTILE", DEFAULT_MODEL_CONFIG.reboundLineQuantile, 0.5, 0.8),
    assistLineQuantile: configNumber(config, "ASSIST_LINE_QUANTILE", DEFAULT_MODEL_CONFIG.assistLineQuantile, 0.5, 0.8),
    threesLineQuantile: configNumber(config, "THREES_LINE_QUANTILE", DEFAULT_MODEL_CONFIG.threesLineQuantile, 0.5, 0.8),
    pointsLineQuantile: configNumber(config, "POINTS_LINE_QUANTILE", DEFAULT_MODEL_CONFIG.pointsLineQuantile, 0.5, 0.8),
    comboLineQuantile: configNumber(config, "COMBO_LINE_QUANTILE", DEFAULT_MODEL_CONFIG.comboLineQuantile, 0.5, 0.8),
    threePointRateMin: configNumber(config, "THREE_POINT_RATE_MIN", DEFAULT_MODEL_CONFIG.threePointRateMin, 0.05, 0.8),
    threePointRateMax: configNumber(config, "THREE_POINT_RATE_MAX", DEFAULT_MODEL_CONFIG.threePointRateMax, 0.1, 0.95),
    scoringUsageWeight: configNumber(config, "SCORING_USAGE_WEIGHT", DEFAULT_MODEL_CONFIG.scoringUsageWeight, 0, 1.5),
    shootingUsageWeight: configNumber(config, "SHOOTING_USAGE_WEIGHT", DEFAULT_MODEL_CONFIG.shootingUsageWeight, 0, 1),
    threePointAttemptShootingWeight: configNumber(config, "THREE_POINT_ATTEMPT_SHOOTING_WEIGHT", DEFAULT_MODEL_CONFIG.threePointAttemptShootingWeight, 0, 0.1),
    threePointAttemptUsageWeight: configNumber(config, "THREE_POINT_ATTEMPT_USAGE_WEIGHT", DEFAULT_MODEL_CONFIG.threePointAttemptUsageWeight, 0, 0.5),
    pointsMakeSkillSlope: configNumber(config, "POINTS_MAKE_SKILL_SLOPE", DEFAULT_MODEL_CONFIG.pointsMakeSkillSlope, 0, 0.08),
    threePointMakeSkillSlope: configNumber(config, "THREE_POINT_MAKE_SKILL_SLOPE", DEFAULT_MODEL_CONFIG.threePointMakeSkillSlope, 0, 0.08),
    assistBaseRate: configNumber(config, "ASSIST_BASE_RATE", DEFAULT_MODEL_CONFIG.assistBaseRate, 0.1, 0.8),
    assistPlaymakingSlope: configNumber(config, "ASSIST_PLAYMAKING_SLOPE", DEFAULT_MODEL_CONFIG.assistPlaymakingSlope, 0, 0.15),
    offensiveReboundBaseRate: configNumber(config, "OFFENSIVE_REBOUND_BASE_RATE", DEFAULT_MODEL_CONFIG.offensiveReboundBaseRate, 0.05, 0.6),
  };
}

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
  for (const game of gamesFromSchedule(community.schedule, community.config)) {
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

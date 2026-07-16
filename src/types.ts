export type Scenario = "Brad Out" | "Brad Plays";
export type TeamId = "Team A" | "Team B" | "Team C";
export type GameId = string;
export type StatKey = "points" | "rebounds" | "assists" | "threes" | "pr" | "pa" | "ra" | "pra";
export type MarketKind = "moneyline" | "spread" | "total" | "team-total" | "player-prop";

export const SCORING_RULES = {
  target: 21,
  insidePoints: 2,
  arcPoints: 3,
  maximumWinningScore: 23,
} as const;

export interface ModelConfig {
  straightVig: number;
  parlayBaseVig: number;
  reboundLineQuantile: number;
  assistLineQuantile: number;
  threesLineQuantile: number;
  pointsLineQuantile: number;
  comboLineQuantile: number;
  threePointRateMin: number;
  threePointRateMax: number;
  scoringUsageWeight: number;
  shootingUsageWeight: number;
  threePointAttemptShootingWeight: number;
  threePointAttemptUsageWeight: number;
  pointsMakeSkillSlope: number;
  threePointMakeSkillSlope: number;
  assistBaseRate: number;
  assistPlaymakingSlope: number;
  offensiveReboundBaseRate: number;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  straightVig: 0.06,
  parlayBaseVig: 0.08,
  reboundLineQuantile: 0.62,
  assistLineQuantile: 0.66,
  threesLineQuantile: 0.62,
  pointsLineQuantile: 0.55,
  comboLineQuantile: 0.58,
  threePointRateMin: 0.22,
  threePointRateMax: 0.55,
  scoringUsageWeight: 0.65,
  shootingUsageWeight: 0.18,
  threePointAttemptShootingWeight: 0.04,
  threePointAttemptUsageWeight: 0.2,
  pointsMakeSkillSlope: 0.028,
  threePointMakeSkillSlope: 0.03,
  assistBaseRate: 0.4,
  assistPlaymakingSlope: 0.04,
  offensiveReboundBaseRate: 0.28,
};

export interface Player {
  id: string;
  name: string;
  active: boolean;
  notes: string;
  overall: number;
  scoring: number;
  shooting: number;
  playmaking: number;
  defense: number;
  rebounding: number;
  stamina: number;
  confidence: "High" | "Medium" | "Low";
  modelOverall: number;
  modelOffense: number;
  modelDefense: number;
  propUsage: number;
  volatility: number;
}

export interface Assignment {
  scenario: Scenario;
  teamId: TeamId;
  playerId: string;
  playerName: string;
  rotationShare: number;
  notes: string;
  gameId?: GameId;
}

export interface BasketballData {
  players: Player[];
  assignments: Assignment[];
  games: GameDefinition[];
  modelConfig: ModelConfig;
  source: "google-sheet" | "cached" | "built-in";
  loadedAt: string;
}

export interface GameDefinition {
  id: GameId;
  number: number;
  team1: TeamId;
  team2: TeamId;
  bye: TeamId | null;
  type: "TOURNAMENT" | "CHAMPIONSHIP" | "EXHIBITION";
  countsTowardStandings: boolean;
  bettingEnabled: boolean;
}

export interface MarketSelection {
  id: string;
  groupId: string;
  gameId: GameId;
  gameNumber: number;
  kind: MarketKind;
  category: string;
  subject: string;
  playerId?: string;
  teamId?: TeamId;
  stat?: StatKey;
  side: "over" | "under" | "team1" | "team2";
  line?: number;
  label: string;
  shortLabel: string;
  fairProbability: number;
  offeredProbability: number;
  decimalOdds: number;
  americanOdds: number;
}

export interface SimulationSummary {
  markets: MarketSelection[];
  simulationCount: number;
  scenario: Scenario;
  teamRatings: Record<TeamId, number>;
  generatedAt: string;
}

export interface ParlayPrice {
  fairProbability: number;
  offeredProbability: number;
  decimalOdds: number;
  americanOdds: number;
  sampleWins: number;
  eligibleSamples: number;
}

export interface TicketLeg {
  marketId: string;
  gameId: GameId;
  kind: MarketKind;
  subject: string;
  playerId?: string;
  teamId?: TeamId;
  stat?: StatKey;
  side: MarketSelection["side"];
  line?: number;
  label: string;
  odds: number;
}

export type TicketStatus = "pending" | "won" | "lost" | "push" | "void";

export interface Ticket {
  id: string;
  createdAt: string;
  participant: string;
  scenario: Scenario;
  stake: number;
  decimalOdds: number;
  americanOdds: number;
  potentialReturn: number;
  fairProbability: number;
  legs: TicketLeg[];
  status: TicketStatus;
  settledReturn: number;
  centralized?: boolean;
}

export interface PlayerBoxScore {
  playerId: string;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
}

export interface GameResult {
  gameId: GameId;
  team1Score: number | null;
  team2Score: number | null;
  final: boolean;
  playerStats: Record<string, PlayerBoxScore>;
}

export interface PersistedState {
  participant: string;
  scenario: Scenario;
  sharedApiUrl: string;
  tickets: Ticket[];
  results: Record<string, GameResult>;
}

export interface SharedScheduleRow {
  gameId: GameId;
  number?: number;
  type?: GameDefinition["type"];
  team1Id?: TeamId;
  team2Id?: TeamId;
  byeId?: TeamId | null;
  team1: string;
  team2: string;
  bye: string;
  countsTowardStandings?: boolean;
  bettingEnabled?: boolean;
  status: "UPCOMING" | "LIVE" | "FINAL";
  team1Score: number | null;
  team2Score: number | null;
  final: boolean;
  bettingLocked: boolean;
  updatedAt: string;
}

export interface SharedBoxScore extends PlayerBoxScore {
  gameId: GameId;
  scenario: Scenario;
  playerName: string;
  teamId: TeamId;
  played: boolean;
}

export interface SharedBet {
  betId: string;
  submittedAt: string;
  bettor: string;
  stake: number;
  decimalOdds: number;
  americanOdds: number;
  potentialReturn: number;
  scenario: Scenario;
  status: TicketStatus;
  settledReturn: number;
  profit: number;
  modelVersion: number;
  eventId: string;
}

export interface SharedBetLeg {
  betId: string;
  legNumber: number;
  gameId: GameId;
  kind: MarketKind;
  subject: string;
  playerId?: string;
  teamId?: TeamId;
  stat?: StatKey;
  side: MarketSelection["side"];
  line?: number;
  label: string;
  odds: number;
  grade?: string;
}

export interface CommunityState {
  config: Record<string, string | number | boolean>;
  players: Player[];
  assignments: Assignment[];
  schedule: SharedScheduleRow[];
  boxScores: SharedBoxScore[];
  bets: SharedBet[];
  betLegs: SharedBetLeg[];
  participants: string[];
  loadedAt: string;
}

export const GAMES: GameDefinition[] = [
  { id: "game-1", number: 1, team1: "Team A", team2: "Team B", bye: "Team C", type: "TOURNAMENT", countsTowardStandings: true, bettingEnabled: true },
  { id: "game-2", number: 2, team1: "Team B", team2: "Team C", bye: "Team A", type: "TOURNAMENT", countsTowardStandings: true, bettingEnabled: true },
  { id: "game-3", number: 3, team1: "Team C", team2: "Team A", bye: "Team B", type: "TOURNAMENT", countsTowardStandings: true, bettingEnabled: true },
];

export const TEAM_COLORS: Record<TeamId, string> = {
  "Team A": "#ff5a44",
  "Team B": "#3dd6a5",
  "Team C": "#7c71ff",
};

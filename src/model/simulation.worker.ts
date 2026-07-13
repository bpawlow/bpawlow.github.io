/// <reference lib="webworker" />
import { GAMES } from "../types";
import type {
  BasketballData,
  GameDefinition,
  GameId,
  MarketSelection,
  ParlayPrice,
  Player,
  Scenario,
  SimulationSummary,
  StatKey,
  TeamId,
} from "../types";
import { clamp, offeredPrice } from "./odds";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const SAMPLE_COUNT = 80_000;
// Standard two-sided sportsbook vig: a fair 50/50 market prices near -110/-110.
// Multiplying both fair probabilities by 1.047619 creates a 4.76% overround.
const STRAIGHT_VIG = 0.047619;
const PARLAY_BASE_HOLD = 0.075;

interface RosterPlayer {
  player: Player;
  share: number;
}

interface GameArrays {
  team1Score: Uint8Array;
  team2Score: Uint8Array;
  stats: Map<string, Uint8Array>;
}

interface InitMessage { type: "init"; data: BasketballData; scenario: Scenario }
interface PriceMessage { type: "price"; requestId: string; marketIds: string[] }
type IncomingMessage = InitMessage | PriceMessage;

let eventOutcomes = new Map<string, Uint8Array>();
let currentSummary: SimulationSummary | null = null;

class Rng {
  private state: number;
  private spare: number | null = null;

  constructor(seed: number) { this.state = seed >>> 0 || 1; }

  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(): number {
    if (this.spare !== null) {
      const value = this.spare;
      this.spare = null;
      return value;
    }
    const u = Math.max(Number.EPSILON, this.next());
    const v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }
}

function pickWeighted<T>(items: T[], weight: (item: T) => number, rng: Rng): T {
  const total = items.reduce((sum, item) => sum + Math.max(0.001, weight(item)), 0);
  let target = rng.next() * total;
  for (const item of items) {
    target -= Math.max(0.001, weight(item));
    if (target <= 0) return item;
  }
  return items[items.length - 1];
}

function rosterFor(data: BasketballData, scenario: Scenario): Record<TeamId, RosterPlayer[]> {
  const players = new Map(data.players.map((player) => [player.id, player]));
  const roster = { "Team A": [], "Team B": [], "Team C": [] } as Record<TeamId, RosterPlayer[]>;
  for (const assignment of data.assignments.filter((item) => item.scenario === scenario)) {
    const player = players.get(assignment.playerId);
    if (player?.active) roster[assignment.teamId].push({ player, share: assignment.rotationShare });
  }
  return roster;
}

function teamMetric(roster: RosterPlayer[], metric: keyof Pick<Player, "overall" | "modelOffense" | "modelDefense" | "rebounding" | "stamina" | "playmaking">): number {
  const denominator = roster.reduce((sum, item) => sum + item.share, 0);
  return roster.reduce((sum, item) => sum + item.player[metric] * item.share, 0) / denominator;
}

function statKey(playerId: string, stat: StatKey): string { return `${playerId}:${stat}`; }

function addStat(game: GameArrays, playerId: string, stat: "points" | "rebounds" | "assists" | "threes", sample: number, amount: number): void {
  const key = statKey(playerId, stat);
  const array = game.stats.get(key);
  if (array) array[sample] = Math.min(255, array[sample] + amount);
}

function createGameArrays(players: RosterPlayer[]): GameArrays {
  const stats = new Map<string, Uint8Array>();
  for (const { player } of players) {
    for (const stat of ["points", "rebounds", "assists", "threes"] as const) {
      stats.set(statKey(player.id, stat), new Uint8Array(SAMPLE_COUNT));
    }
  }
  return { team1Score: new Uint8Array(SAMPLE_COUNT), team2Score: new Uint8Array(SAMPLE_COUNT), stats };
}

function simulateGame(
  game: GameDefinition,
  arrays: GameArrays,
  sample: number,
  roster: Record<TeamId, RosterPlayer[]>,
  playerForm: Map<string, number>,
  consecutive: Set<TeamId>,
  rng: Rng,
): void {
  const sides = [game.team1, game.team2] as const;
  const score = [0, 0];
  const teamOffense = sides.map((team) => teamMetric(roster[team], "modelOffense"));
  const teamDefense = sides.map((team) => teamMetric(roster[team], "modelDefense"));
  const teamPlaymaking = sides.map((team) => teamMetric(roster[team], "playmaking"));
  const teamGameForm = [rng.normal() * 0.035, rng.normal() * 0.035];
  let offense = rng.next() < 0.5 ? 0 : 1;
  let possessions = 0;

  while (score[0] < 21 && score[1] < 21 && possessions < 300) {
    const defense = offense === 0 ? 1 : 0;
    const offenseTeam = sides[offense];
    const offenseRoster = roster[offenseTeam];
    const defenseRoster = roster[sides[defense]];
    const shooter = pickWeighted(offenseRoster, ({ player, share }) =>
      share * (0.35 + player.propUsage * 0.8 + player.scoring * 0.035), rng);
    const fatigue = consecutive.has(offenseTeam)
      ? Math.max(0, 7 - teamMetric(offenseRoster, "stamina")) * 0.006
      : 0;
    const individualForm = playerForm.get(shooter.player.id) ?? 0;
    const turnoverChance = clamp(0.115 - shooter.player.playmaking * 0.006 + teamDefense[defense] * 0.004, 0.055, 0.17);
    possessions += 1;

    if (rng.next() < turnoverChance) {
      offense = defense;
      continue;
    }

    const twoPointRate = clamp(0.18 + shooter.player.shooting * 0.025 + shooter.player.propUsage * 0.06, 0.18, 0.5);
    const isTwo = rng.next() < twoPointRate;
    const baseMake = isTwo ? 0.29 : 0.49;
    const skill = isTwo ? shooter.player.shooting : (shooter.player.scoring * 0.7 + shooter.player.overall * 0.3);
    const makeChance = clamp(
      baseMake + (skill - 5) * (isTwo ? 0.022 : 0.025) - (teamDefense[defense] - 5) * 0.012
        + (teamOffense[offense] - 5) * 0.004 + teamGameForm[offense] + individualForm - fatigue,
      isTwo ? 0.14 : 0.28,
      isTwo ? 0.48 : 0.68,
    );

    if (rng.next() < makeChance) {
      const points = isTwo ? 2 : 1;
      score[offense] += points;
      addStat(arrays, shooter.player.id, "points", sample, points);
      if (isTwo) addStat(arrays, shooter.player.id, "threes", sample, 1);

      const potentialAssisters = offenseRoster.filter((item) => item.player.id !== shooter.player.id);
      const assistChance = clamp(0.34 + (teamPlaymaking[offense] - 5) * 0.035, 0.22, 0.7);
      if (potentialAssisters.length && rng.next() < assistChance) {
        const assister = pickWeighted(potentialAssisters, ({ player, share }) => share * (0.3 + player.playmaking / 6), rng);
        addStat(arrays, assister.player.id, "assists", sample, 1);
      }
      offense = defense;
      continue;
    }

    const offenseRebounding = teamMetric(offenseRoster, "rebounding");
    const defenseRebounding = teamMetric(defenseRoster, "rebounding");
    const offensiveReboundChance = clamp(0.24 + (offenseRebounding - defenseRebounding) * 0.018, 0.13, 0.38);
    const offensiveBoard = rng.next() < offensiveReboundChance;
    const reboundRoster = offensiveBoard ? offenseRoster : defenseRoster;
    const rebounder = pickWeighted(reboundRoster, ({ player, share }) => share * (0.25 + player.rebounding / 5), rng);
    addStat(arrays, rebounder.player.id, "rebounds", sample, 1);
    if (!offensiveBoard) offense = defense;
  }

  arrays.team1Score[sample] = score[0];
  arrays.team2Score[sample] = score[1];
}

function median(values: Uint8Array | Int16Array): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const counts = new Uint32Array(max - min + 1);
  for (const value of values) counts[value - min] += 1;
  const target = Math.floor(values.length / 2);
  let cumulative = 0;
  for (let index = 0; index < counts.length; index += 1) {
    cumulative += counts[index];
    if (cumulative > target) return index + min;
  }
  return min;
}

function mean(values: Int16Array): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function halfLine(center: number): number { return Math.floor(center) + 0.5; }

function outcomesAbove(values: Uint8Array | Int16Array, line: number): [Uint8Array, Uint8Array] {
  const over = new Uint8Array(SAMPLE_COUNT);
  const under = new Uint8Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    if (values[i] > line) { over[i] = 1; under[i] = 0; }
    else if (values[i] < line) { over[i] = 0; under[i] = 1; }
    else { over[i] = 2; under[i] = 2; }
  }
  return [over, under];
}

function fairProbability(outcomes: Uint8Array): number {
  let wins = 0;
  let eligible = 0;
  for (const outcome of outcomes) {
    if (outcome !== 2) eligible += 1;
    if (outcome === 1) wins += 1;
  }
  return (wins + 0.5) / (eligible + 1);
}

function lineText(line: number): string { return line > 0 ? `+${line}` : `${line}`; }

function buildMarkets(
  games: Map<GameId, GameArrays>,
  roster: Record<TeamId, RosterPlayer[]>,
): MarketSelection[] {
  const markets: MarketSelection[] = [];

  const registerPair = (
    base: Omit<MarketSelection, "id" | "side" | "label" | "shortLabel" | "fairProbability" | "offeredProbability" | "decimalOdds" | "americanOdds">,
    first: { id: string; side: MarketSelection["side"]; label: string; shortLabel: string; line?: number; teamId?: TeamId },
    second: { id: string; side: MarketSelection["side"]; label: string; shortLabel: string; line?: number; teamId?: TeamId },
    pair: [Uint8Array, Uint8Array],
  ) => {
    [first, second].forEach((selection, index) => {
      const probability = fairProbability(pair[index]);
      const price = offeredPrice(probability, STRAIGHT_VIG);
      const market: MarketSelection = { ...base, ...selection, fairProbability: probability, ...price };
      markets.push(market);
      eventOutcomes.set(market.id, pair[index]);
    });
  };

  for (const game of GAMES) {
    const arrays = games.get(game.id)!;
    const groupBase = { gameId: game.id, gameNumber: game.number };
    const margin = new Int16Array(SAMPLE_COUNT);
    const total = new Uint8Array(SAMPLE_COUNT);
    const moneyline1 = new Uint8Array(SAMPLE_COUNT);
    const moneyline2 = new Uint8Array(SAMPLE_COUNT);
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      margin[i] = arrays.team1Score[i] - arrays.team2Score[i];
      total[i] = arrays.team1Score[i] + arrays.team2Score[i];
      moneyline1[i] = arrays.team1Score[i] > arrays.team2Score[i] ? 1 : 0;
      moneyline2[i] = moneyline1[i] ? 0 : 1;
    }

    registerPair(
      { ...groupBase, groupId: `${game.id}:ml`, kind: "moneyline", category: "Game lines", subject: "Winner" },
      { id: `${game.id}:ml:${game.team1}`, side: "team1", label: `${game.team1} to win`, shortLabel: game.team1 },
      { id: `${game.id}:ml:${game.team2}`, side: "team2", label: `${game.team2} to win`, shortLabel: game.team2 },
      [moneyline1, moneyline2],
    );

    const spreadThreshold = halfLine(mean(margin));
    const spreadPair = outcomesAbove(margin, spreadThreshold);
    registerPair(
      { ...groupBase, groupId: `${game.id}:spread`, kind: "spread", category: "Game lines", subject: "Spread" },
      { id: `${game.id}:spread:${game.team1}`, side: "team1", teamId: game.team1, line: -spreadThreshold, label: `${game.team1} ${lineText(-spreadThreshold)}`, shortLabel: `${game.team1} ${lineText(-spreadThreshold)}` },
      { id: `${game.id}:spread:${game.team2}`, side: "team2", teamId: game.team2, line: spreadThreshold, label: `${game.team2} ${lineText(spreadThreshold)}`, shortLabel: `${game.team2} ${lineText(spreadThreshold)}` },
      spreadPair,
    );

    const totalLine = halfLine(median(total));
    const totalPair = outcomesAbove(total, totalLine);
    registerPair(
      { ...groupBase, groupId: `${game.id}:total`, kind: "total", category: "Game lines", subject: "Game total", line: totalLine },
      { id: `${game.id}:total:over`, side: "over", line: totalLine, label: `Over ${totalLine}`, shortLabel: `O ${totalLine}` },
      { id: `${game.id}:total:under`, side: "under", line: totalLine, label: `Under ${totalLine}`, shortLabel: `U ${totalLine}` },
      totalPair,
    );

    const activePlayers = [...roster[game.team1], ...roster[game.team2]];
    for (const { player } of activePlayers) {
      const raw = {
        points: arrays.stats.get(statKey(player.id, "points"))!,
        rebounds: arrays.stats.get(statKey(player.id, "rebounds"))!,
        assists: arrays.stats.get(statKey(player.id, "assists"))!,
        threes: arrays.stats.get(statKey(player.id, "threes"))!,
      };
      const statValues = new Map<StatKey, Uint8Array>();
      statValues.set("points", raw.points);
      statValues.set("rebounds", raw.rebounds);
      statValues.set("assists", raw.assists);
      statValues.set("threes", raw.threes);
      for (const combo of ["pr", "pa", "ra", "pra"] as const) {
        const values = new Uint8Array(SAMPLE_COUNT);
        for (let i = 0; i < SAMPLE_COUNT; i += 1) {
          if (combo === "pr") values[i] = raw.points[i] + raw.rebounds[i];
          if (combo === "pa") values[i] = raw.points[i] + raw.assists[i];
          if (combo === "ra") values[i] = raw.rebounds[i] + raw.assists[i];
          if (combo === "pra") values[i] = raw.points[i] + raw.rebounds[i] + raw.assists[i];
        }
        statValues.set(combo, values);
      }
      const statLabels: Record<StatKey, string> = {
        points: "Points", rebounds: "Rebounds", assists: "Assists", threes: "3-pointers", pr: "Pts + Reb", pa: "Pts + Ast", ra: "Reb + Ast", pra: "PRA",
      };
      for (const [stat, values] of statValues) {
        const line = halfLine(median(values));
        const pair = outcomesAbove(values, line);
        const groupId = `${game.id}:player:${player.id}:${stat}`;
        registerPair(
          { ...groupBase, groupId, kind: "player-prop", category: "Player props", subject: player.name, playerId: player.id, stat, line },
          { id: `${groupId}:over`, side: "over", line, label: `${player.name} ${statLabels[stat]} over ${line}`, shortLabel: `O ${line}` },
          { id: `${groupId}:under`, side: "under", line, label: `${player.name} ${statLabels[stat]} under ${line}`, shortLabel: `U ${line}` },
          pair,
        );
      }
    }
  }
  return markets;
}

function initialize(data: BasketballData, scenario: Scenario): SimulationSummary {
  eventOutcomes = new Map();
  const roster = rosterFor(data, scenario);
  const allPlayerIds = new Set(Object.values(roster).flat().map((item) => item.player.id));
  const gameArrays = new Map<GameId, GameArrays>();
  for (const game of GAMES) gameArrays.set(game.id, createGameArrays([...roster[game.team1], ...roster[game.team2]]));
  const rng = new Rng(scenario === "Brad Plays" ? 20260816 : 20260815);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const playerForm = new Map<string, number>();
    for (const playerId of allPlayerIds) {
      const player = data.players.find((candidate) => candidate.id === playerId)!;
      playerForm.set(playerId, rng.normal() * 0.018 * player.volatility);
    }
    let priorTeams = new Set<TeamId>();
    for (const game of GAMES) {
      const currentTeams = new Set<TeamId>([game.team1, game.team2]);
      const consecutive = new Set<TeamId>([...currentTeams].filter((team) => priorTeams.has(team)));
      simulateGame(game, gameArrays.get(game.id)!, sample, roster, playerForm, consecutive, rng);
      priorTeams = currentTeams;
    }
  }

  const teamRatings = {} as Record<TeamId, number>;
  for (const team of ["Team A", "Team B", "Team C"] as TeamId[]) {
    teamRatings[team] = Number((
      teamMetric(roster[team], "overall") * 0.45 + teamMetric(roster[team], "modelOffense") * 0.3
      + teamMetric(roster[team], "modelDefense") * 0.2 + teamMetric(roster[team], "rebounding") * 0.05
    ).toFixed(2));
  }
  return { markets: buildMarkets(gameArrays, roster), simulationCount: SAMPLE_COUNT, scenario, teamRatings, generatedAt: new Date().toISOString() };
}

function priceParlay(marketIds: string[]): ParlayPrice {
  if (!marketIds.length) throw new Error("No selections");
  const arrays = marketIds.map((id) => eventOutcomes.get(id)).filter((value): value is Uint8Array => Boolean(value));
  if (arrays.length !== marketIds.length) throw new Error("A selected market is stale");
  let wins = 0;
  let eligible = 0;
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    let allWin = true;
    let hasEligible = false;
    for (const outcomes of arrays) {
      if (outcomes[sample] === 0) { allWin = false; hasEligible = true; break; }
      if (outcomes[sample] === 1) hasEligible = true;
    }
    if (hasEligible) eligible += 1;
    if (allWin && hasEligible) wins += 1;
  }
  const fairProbability = (wins + 0.5) / (eligible + 1);
  const hold = PARLAY_BASE_HOLD + Math.max(0, marketIds.length - 2) * 0.018;
  return { fairProbability, ...offeredPrice(fairProbability, hold), sampleWins: wins, eligibleSamples: eligible };
}

ctx.onmessage = (event: MessageEvent<IncomingMessage>) => {
  try {
    if (event.data.type === "init") {
      currentSummary = initialize(event.data.data, event.data.scenario);
      ctx.postMessage({ type: "ready", summary: currentSummary });
    } else {
      if (!currentSummary) throw new Error("Simulation is not ready");
      ctx.postMessage({ type: "price", requestId: event.data.requestId, price: priceParlay(event.data.marketIds) });
    }
  } catch (error) {
    ctx.postMessage({ type: "error", requestId: event.data.type === "price" ? event.data.requestId : undefined, message: error instanceof Error ? error.message : "Simulation failed" });
  }
};

export {};

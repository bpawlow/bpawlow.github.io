import type { Assignment, BasketballData, Player, Scenario, TeamId } from "../types";

const PUBLISHED_ID = "2PACX-1vRDjKmtD4NhvY8nf7vAomX-PYzTsBT183-XdRlwlbNQppvJmNYix6XI8DRzQiwKf7PpLmXgPWQ8nqUX";
const BASE_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub`;
const RATINGS_GID = "1398010636";
const ASSIGNMENTS_GID = "467420035";
const CACHE_KEY = "bachelor-book-data-v2";

const FALLBACK_RATINGS = `Player,Active?,Notes,Overall Talent,Scoring,Shooting,Playmaking / Handle,Defense,Rebounding / Size,Stamina,Confidence,Friend Notes,Model Overall,Model Offense,Model Defense,Prop Usage,Volatility
Alex,Yes,,8.83,9,8,8,9,10,9,Low,,8.8,8.5,9.3,85%,1.3
Peter,Yes,,7.33,8,8,10,5,6,7,High,,7.3,8.3,5.6,90%,0.8
Andrew,Yes,,6,5,5,5,7,7,7,Low,,5.9,5.1,7,50%,1.3
Jason,Yes,,4,3,3,3,4,5,6,Low,,3.7,3.1,4.6,30%,1.3
Eric,Yes,,8.17,9,9,8,8,7,8,High,"High upside scorer, came off a 20 ppg season and won the championship",8.3,8.7,7.8,85%,0.8
Josh,Yes,,6.83,7,7,5,8,6,8,Low,,6.9,6.6,7.5,60%,1.3
Zak,Yes,,7.83,7,7,8,8,7,10,Low,,7.6,7.3,8.1,75%,1.3
James,Yes,,6,3,7,3,5,9,9,Low,,5.4,4.3,6.6,30%,1.3
Emil,Yes,,8.5,9,9,7,9,9,8,High,,8.6,8.6,8.9,80%,0.8
Darryl,Yes,,7,9,7,6,8,7,5,Low,,7.4,7.7,7.3,75%,1.3
Berler,Yes,,6.17,5,5,5,7,7,8,Low,,5.9,5.1,7.2,50%,1.3
Alan,Yes,,6.67,7,6,6,6,5,10,High,,6.5,6.5,6.4,65%,0.8
Brad,Maybe,Injury-dependent,7,8,9,8,6,5,6,Medium,,7.2,8.2,5.8,80%,1`;

const FALLBACK_ASSIGNMENTS = `Scenario,Team,Slot,Player,Active?,Notes
Brad Out,Team A,1,Alex,Yes,
Brad Out,Team A,2,Peter,Yes,
Brad Out,Team A,3,Andrew,Yes,
Brad Out,Team A,4,Jason,Yes,
Brad Out,Team B,1,Eric,Yes,
Brad Out,Team B,2,Josh,Yes,
Brad Out,Team B,3,Zak,Yes,
Brad Out,Team B,4,James,Yes,
Brad Out,Team C,1,Emil,Yes,
Brad Out,Team C,2,Darryl,Yes,
Brad Out,Team C,3,Berler,Yes,
Brad Out,Team C,4,Alan,Yes,
Brad Plays,Team A,1,Alex,Yes,
Brad Plays,Team A,2,Peter,Yes,
Brad Plays,Team A,3,Josh,Yes,
Brad Plays,Team A,4,Berler/Jason,Yes,Shared sub slot
Brad Plays,Team B,1,Eric,Yes,
Brad Plays,Team B,2,Zak,Yes,
Brad Plays,Team B,3,Brad,Yes,
Brad Plays,Team B,4,James,Yes,
Brad Plays,Team C,1,Emil,Yes,
Brad Plays,Team C,2,Darryl,Yes,
Brad Plays,Team C,3,Alan,Yes,
Brad Plays,Team C,4,Andrew,Yes,`;

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function number(value: string | undefined, fallback = 5): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePlayers(csv: string): Player[] {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((row) => row[0] === "Player");
  if (headerIndex < 0) throw new Error("Player header was not found");
  const headers = rows[headerIndex];
  const at = (row: string[], label: string) => row[headers.indexOf(label)] ?? "";
  const players = rows.slice(headerIndex + 1).filter((row) => row[0]).map((row): Player => ({
    id: slug(at(row, "Player")),
    name: at(row, "Player"),
    active: at(row, "Active?").toLowerCase() !== "no",
    notes: [at(row, "Notes"), at(row, "Friend Notes")].filter(Boolean).join(" — "),
    overall: number(at(row, "Overall Talent")),
    scoring: number(at(row, "Scoring")),
    shooting: number(at(row, "Shooting")),
    playmaking: number(at(row, "Playmaking / Handle")),
    defense: number(at(row, "Defense")),
    rebounding: number(at(row, "Rebounding / Size")),
    stamina: number(at(row, "Stamina")),
    confidence: (at(row, "Confidence") || "Medium") as Player["confidence"],
    modelOverall: number(at(row, "Model Overall")),
    modelOffense: number(at(row, "Model Offense")),
    modelDefense: number(at(row, "Model Defense")),
    propUsage: number(at(row, "Prop Usage").replace("%", ""), 50) / 100,
    volatility: number(at(row, "Volatility"), 1),
  }));
  if (players.length < 12) throw new Error("Player sheet did not contain enough players");
  return players;
}

function parseAssignments(csv: string, players: Player[]): Assignment[] {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((row) => row[0] === "Scenario");
  if (headerIndex < 0) throw new Error("Assignment header was not found");
  const playerByName = new Map(players.map((player) => [player.name, player]));
  const assignments: Assignment[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const scenario = row[0] as Scenario;
    const teamId = row[1] as TeamId;
    const name = row[3];
    if (!name || !["Brad Out", "Brad Plays"].includes(scenario)) continue;
    if (name === "Berler/Jason") {
      for (const sub of ["Berler", "Jason"]) {
        const player = playerByName.get(sub);
        if (!player) throw new Error(`${sub} is missing from ratings`);
        assignments.push({ scenario, teamId, playerId: player.id, playerName: player.name, rotationShare: 0.5, notes: "Shared rotation slot" });
      }
    } else {
      const player = playerByName.get(name);
      if (!player) throw new Error(`${name} is missing from ratings`);
      assignments.push({ scenario, teamId, playerId: player.id, playerName: player.name, rotationShare: 1, notes: row[5] ?? "" });
    }
  }
  if (assignments.length < 24) throw new Error("Assignment sheet is incomplete");
  return assignments;
}

function normalize(ratingsCsv: string, assignmentsCsv: string, source: BasketballData["source"]): BasketballData {
  const players = parsePlayers(ratingsCsv);
  return { players, assignments: parseAssignments(assignmentsCsv, players), source, loadedAt: new Date().toISOString() };
}

async function fetchTab(gid: string): Promise<string> {
  const response = await fetch(`${BASE_URL}?gid=${gid}&single=true&output=csv&_=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheet returned ${response.status}`);
  return response.text();
}

export async function loadBasketballData(forceRefresh = false): Promise<BasketballData> {
  try {
    const [ratings, assignments] = await Promise.all([fetchTab(RATINGS_GID), fetchTab(ASSIGNMENTS_GID)]);
    const data = normalize(ratings, assignments, "google-sheet");
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (error) {
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          return { ...(JSON.parse(cached) as BasketballData), source: "cached" };
        } catch {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    }
    console.warn("Using built-in ratings because the published Sheet could not be loaded", error);
    return normalize(FALLBACK_RATINGS, FALLBACK_ASSIGNMENTS, "built-in");
  }
}

export const sheetPublicUrl = `${BASE_URL}html`;

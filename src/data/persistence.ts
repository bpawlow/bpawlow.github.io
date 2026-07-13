import { GAMES } from "../types";
import type { GameId, PersistedState, Scenario } from "../types";
import { DEFAULT_SHARED_API_URL } from "./sharedApi";

const KEY = "bachelor-book-state-v3";

function emptyResults(): PersistedState["results"] {
  return Object.fromEntries(GAMES.map((game) => [game.id, {
    gameId: game.id,
    team1Score: null,
    team2Score: null,
    final: false,
    playerStats: {},
  }])) as Record<GameId, PersistedState["results"][GameId]>;
}

export function initialState(): PersistedState {
  return { participant: "", scenario: "Brad Out", sharedApiUrl: DEFAULT_SHARED_API_URL, tickets: [], results: emptyResults() };
}

export function loadState(): PersistedState {
  const fallback = initialState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      participant: typeof parsed.participant === "string" ? parsed.participant : "",
      scenario: (parsed.scenario === "Brad Plays" ? "Brad Plays" : "Brad Out") as Scenario,
      sharedApiUrl: typeof parsed.sharedApiUrl === "string" && parsed.sharedApiUrl.trim() ? parsed.sharedApiUrl.trim() : DEFAULT_SHARED_API_URL,
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      results: { ...fallback.results, ...(parsed.results ?? {}) },
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportState(state: PersistedState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bachelor-book-${state.participant || "backup"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importState(file: File): Promise<PersistedState> {
  const parsed = JSON.parse(await file.text()) as PersistedState;
  if (!Array.isArray(parsed.tickets) || typeof parsed.participant !== "string") throw new Error("Invalid backup file");
  return parsed;
}

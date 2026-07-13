import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import "./App.css";
import { exportState, importState, loadState, saveState } from "./data/persistence";
import { loadBasketballData, sheetPublicUrl } from "./data/googleSheets";
import { isGameLocked, loadCommunityState, resultsFromCommunity, sharedTickets, submitSharedTicket } from "./data/sharedApi";
import { formatAmerican, money } from "./model/odds";
import { gradeLeg, ledger, settleTickets } from "./model/settlement";
import { SimulationClient } from "./model/simulationClient";
import { calculateStandings } from "./model/standings";
import { GAMES, TEAM_COLORS } from "./types";
import type {
  BasketballData,
  CommunityState,
  GameId,
  GameResult,
  MarketSelection,
  ParlayPrice,
  PersistedState,
  PlayerBoxScore,
  Scenario,
  SimulationSummary,
  StatKey,
  TeamId,
  Ticket,
} from "./types";

type Tab = "sportsbook" | "bets" | "leaderboard" | "tournament" | "rules";

const STAT_LABELS: Record<StatKey, string> = {
  points: "Points", rebounds: "Rebounds", assists: "Assists", threes: "3PM",
  pr: "Pts + Reb", pa: "Pts + Ast", ra: "Reb + Ast", pra: "PRA",
};

function nowLabel(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function sourceLabel(data: BasketballData): string {
  if (data.source === "google-sheet") return "Live Sheet";
  if (data.source === "cached") return "Cached Sheet";
  return "Offline snapshot";
}

function activeRoster(data: BasketballData, scenario: Scenario, teamId: TeamId) {
  return data.assignments.filter((item) => item.scenario === scenario && item.teamId === teamId);
}

function TeamPill({ team }: { team: TeamId }): ReactElement {
  return <span className="team-pill" style={{ "--team": TEAM_COLORS[team] } as React.CSSProperties}>{team}</span>;
}

function OddsButton({ market, selected, onClick }: { market: MarketSelection; selected: boolean; onClick: () => void }): ReactElement {
  return (
    <button className={`odds-button ${selected ? "selected" : ""}`} type="button" onClick={onClick} aria-pressed={selected}>
      <span>{market.shortLabel}</span>
      <strong>{formatAmerican(market.americanOdds)}</strong>
    </button>
  );
}

function MarketPair({ pair, selectedIds, onToggle }: {
  pair: MarketSelection[];
  selectedIds: Set<string>;
  onToggle: (market: MarketSelection) => void;
}): ReactElement {
  return (
    <div className="market-row">
      <div className="market-name">
        <span>{pair[0].subject}</span>
        {pair[0].stat && <small>{STAT_LABELS[pair[0].stat]}</small>}
      </div>
      <div className="odds-pair">
        {pair.map((market) => <OddsButton key={market.id} market={market} selected={selectedIds.has(market.id)} onClick={() => onToggle(market)} />)}
      </div>
    </div>
  );
}

function BetSlip({ selections, price, pricing, stake, available, onStake, onRemove, onClear, onPlace }: {
  selections: MarketSelection[];
  price: ParlayPrice | null;
  pricing: boolean;
  stake: string;
  available: number;
  onStake: (value: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPlace: () => void;
}): ReactElement {
  const decimal = selections.length === 1 ? selections[0].decimalOdds : price?.decimalOdds ?? 0;
  const american = selections.length === 1 ? selections[0].americanOdds : price?.americanOdds ?? 0;
  const stakeNumber = Number.parseFloat(stake) || 0;
  const payout = stakeNumber * decimal;
  return (
    <aside className="bet-slip">
      <div className="slip-heading">
        <div><span className="eyebrow">Your ticket</span><h2>{selections.length > 1 ? `${selections.length}-leg parlay` : "Bet slip"}</h2></div>
        {selections.length > 0 && <button className="text-button" type="button" onClick={onClear}>Clear</button>}
      </div>
      {selections.length === 0 ? (
        <div className="empty-slip"><span>＋</span><p>Tap any odds to add a pick.</p></div>
      ) : (
        <>
          <div className="slip-legs">
            {selections.map((market) => (
              <div className="slip-leg" key={market.id}>
                <div><strong>{market.label}</strong><small>Game {market.gameNumber} · {market.category}</small></div>
                <button type="button" onClick={() => onRemove(market.id)} aria-label={`Remove ${market.label}`}>×</button>
              </div>
            ))}
          </div>
          <div className="price-line">
            <span>{selections.length > 1 ? "Correlation-adjusted odds" : "Odds"}</span>
            <strong>{pricing ? "Pricing…" : formatAmerican(american)}</strong>
          </div>
          {selections.length > 1 && price && (
            <p className="model-note">Joint win probability {(price.fairProbability * 100).toFixed(1)}% · priced from {price.eligibleSamples.toLocaleString()} tournament simulations</p>
          )}
          <label className="stake-field">
            <span>Stake <small>{money(available)} available</small></span>
            <div><input inputMode="decimal" min="0.1" step="0.1" value={stake} onChange={(event) => onStake(event.target.value)} placeholder="0.0" /><b>units</b></div>
          </label>
          <div className="payout-card"><span>Potential return</span><strong>{decimal ? payout.toFixed(1) : "—"} units</strong></div>
          <button className="primary-button" type="button" disabled={pricing || !price && selections.length > 1 || stakeNumber <= 0 || stakeNumber > available} onClick={onPlace}>Place play-money bet</button>
        </>
      )}
    </aside>
  );
}

function Sportsbook({ data, summary, gameId, setGameId, selections, toggleMarket }: {
  data: BasketballData;
  summary: SimulationSummary;
  gameId: GameId;
  setGameId: (game: GameId) => void;
  selections: MarketSelection[];
  toggleMarket: (market: MarketSelection) => void;
}): ReactElement {
  const game = GAMES.find((candidate) => candidate.id === gameId)!;
  const selectedIds = new Set(selections.map((item) => item.id));
  const gameMarkets = summary.markets.filter((market) => market.gameId === gameId);
  const grouped = (markets: MarketSelection[]) => {
    const groups = new Map<string, MarketSelection[]>();
    for (const market of markets) groups.set(market.groupId, [...(groups.get(market.groupId) ?? []), market]);
    return [...groups.values()];
  };
  const gameLines = grouped(gameMarkets.filter((market) => market.category === "Game lines"));
  const teamTotals = grouped(gameMarkets.filter((market) => market.category === "Team totals"));
  const propsByPlayer = new Map<string, MarketSelection[][]>();
  for (const pair of grouped(gameMarkets.filter((market) => market.category === "Player props"))) {
    propsByPlayer.set(pair[0].subject, [...(propsByPlayer.get(pair[0].subject) ?? []), pair]);
  }

  return (
    <div className="sportsbook-content">
      <div className="game-tabs" role="tablist">
        {GAMES.map((item) => <button type="button" role="tab" aria-selected={item.id === gameId} className={item.id === gameId ? "active" : ""} key={item.id} onClick={() => setGameId(item.id)}><span>Game {item.number}</span><small>{item.team1.replace("Team ", "")} vs {item.team2.replace("Team ", "")}</small></button>)}
      </div>
      <section className="matchup-hero">
        <div className="team-side">
          <TeamPill team={game.team1} /><strong>{summary.teamRatings[game.team1].toFixed(1)}</strong><small>power rating</small>
          <p>{activeRoster(data, summary.scenario, game.team1).map((item) => item.rotationShare < 1 ? `${item.playerName} (${item.rotationShare * 100}%)` : item.playerName).join(" · ")}</p>
        </div>
        <div className="versus"><span>GAME {game.number}</span><b>VS</b><small>{game.bye} bye</small></div>
        <div className="team-side right">
          <TeamPill team={game.team2} /><strong>{summary.teamRatings[game.team2].toFixed(1)}</strong><small>power rating</small>
          <p>{activeRoster(data, summary.scenario, game.team2).map((item) => item.rotationShare < 1 ? `${item.playerName} (${item.rotationShare * 100}%)` : item.playerName).join(" · ")}</p>
        </div>
      </section>

      <section className="market-card">
        <div className="section-title"><div><span className="eyebrow">Main board</span><h2>Game lines</h2></div><span className="column-hint">Selection · Odds</span></div>
        {gameLines.map((pair) => <MarketPair key={pair[0].groupId} pair={pair} selectedIds={selectedIds} onToggle={toggleMarket} />)}
      </section>
      <section className="market-card">
        <div className="section-title"><div><span className="eyebrow">Team markets</span><h2>Team totals</h2></div></div>
        {teamTotals.map((pair) => <MarketPair key={pair[0].groupId} pair={pair} selectedIds={selectedIds} onToggle={toggleMarket} />)}
      </section>
      <div className="section-title props-title"><div><span className="eyebrow">The full board</span><h2>Player props</h2></div><span>{propsByPlayer.size} active players</span></div>
      <div className="player-prop-grid">
        {[...propsByPlayer.entries()].map(([player, pairs]) => (
          <details className="player-card" key={player} open={propsByPlayer.size <= 8}>
            <summary><span className="avatar">{player.slice(0, 1)}</span><strong>{player}</strong><span>{pairs.length} markets</span></summary>
            <div>{pairs.map((pair) => <MarketPair key={pair[0].groupId} pair={pair} selectedIds={selectedIds} onToggle={toggleMarket} />)}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

function TicketsView({ tickets, results }: { tickets: Ticket[]; results: PersistedState["results"] }): ReactElement {
  if (!tickets.length) return <div className="empty-page"><span>⌁</span><h2>No tickets yet</h2><p>Your straight bets and parlays will appear here.</p></div>;
  return (
    <div className="page-stack">
      <div className="page-heading"><span className="eyebrow">Ledger</span><h1>My bets</h1><p>Ticket lines and odds are frozen when placed.</p></div>
      {tickets.slice().reverse().map((ticket) => (
        <article className="ticket-card" key={ticket.id}>
          <header><div><span className={`status ${ticket.status}`}>{ticket.status}</span><strong>{ticket.legs.length > 1 ? `${ticket.legs.length}-leg parlay` : "Straight bet"}</strong></div><time>{new Date(ticket.createdAt).toLocaleString()}</time></header>
          <div className="ticket-legs">{ticket.legs.map((leg) => <div key={leg.marketId}><span className={`grade grade-${gradeLeg(leg, results)}`}></span><p><strong>{leg.label}</strong><small>{gradeLeg(leg, results)}</small></p></div>)}</div>
          <footer><span>Stake <b>{money(ticket.stake)}</b></span><span>Odds <b>{formatAmerican(ticket.americanOdds)}</b></span><span>{ticket.status === "won" ? "Returned" : "To return"} <b>{money(ticket.status === "won" ? ticket.settledReturn : ticket.potentialReturn)}</b></span></footer>
        </article>
      ))}
    </div>
  );
}

function ScoreInput({ value, onChange, label }: { value: number | null; onChange: (value: number | null) => void; label: string }): ReactElement {
  return <label className="score-input"><span>{label}</span><input type="number" min="0" max="22" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}

function TournamentView({ data, scenario, results, onResults, readOnly = false }: {
  data: BasketballData;
  scenario: Scenario;
  results: PersistedState["results"];
  onResults: (results: PersistedState["results"]) => void;
  readOnly?: boolean;
}): ReactElement {
  const standings = calculateStandings(results);
  const updateGame = (gameId: GameId, patch: Partial<GameResult>) => onResults({ ...results, [gameId]: { ...results[gameId], ...patch } });
  const updatePlayer = (gameId: GameId, playerId: string, field: keyof PlayerBoxScore, value: number) => {
    const game = results[gameId];
    const current = game.playerStats[playerId] ?? { playerId, points: 0, rebounds: 0, assists: 0, threes: 0 };
    updateGame(gameId, { playerStats: { ...game.playerStats, [playerId]: { ...current, [field]: value } } });
  };
  return (
    <div className="page-stack">
      <div className="page-heading"><span className="eyebrow">Round robin</span><h1>Tournament center</h1><p>{readOnly ? "Official scores and box scores are synchronized from the shared Google Sheet." : "Enter official results on the scorekeeper device to settle locally stored tickets."}</p></div>
      <section className="standings-card">
        <div className="section-title"><div><span className="eyebrow">Live table</span><h2>Standings</h2></div></div>
        <div className="standings-head"><span>Team</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>DIFF</span></div>
        {standings.map((row) => <div className="standing-row" key={row.teamId}><span><b>{row.rank}</b><TeamPill team={row.teamId} /></span><strong>{row.wins}</strong><span>{row.losses}</span><span>{row.pointsFor}</span><span>{row.pointsAgainst}</span><strong className={row.differential > 0 ? "positive" : row.differential < 0 ? "negative" : ""}>{row.differential > 0 ? "+" : ""}{row.differential}</strong></div>)}
        <p className="tie-note">Ties: wins → point differential → points scored → organizer coin flip.</p>
      </section>
      {GAMES.map((game) => {
        const result = results[game.id];
        const roster = [...activeRoster(data, scenario, game.team1), ...activeRoster(data, scenario, game.team2)];
        return (
          <details className="result-card" key={game.id}>
            <summary><span>Game {game.number}</span><strong>{game.team1} {result.team1Score ?? "–"} <i>vs</i> {result.team2Score ?? "–"}</strong><span className={result.final ? "final-tag" : "pending-tag"}>{result.final ? "Final" : "Open"}</span></summary>
            <div className="result-editor">
              <div className="score-editor">
                <fieldset disabled={readOnly} className="score-editor-fields">
                <ScoreInput label={game.team1} value={result.team1Score} onChange={(team1Score) => updateGame(game.id, { team1Score, final: false })} />
                <b>–</b>
                <ScoreInput label={game.team2} value={result.team2Score} onChange={(team2Score) => updateGame(game.id, { team2Score, final: false })} />
                <label className="final-check"><input type="checkbox" checked={result.final} disabled={result.team1Score === null || result.team2Score === null} onChange={(event) => updateGame(game.id, { final: event.target.checked })} /> Mark final</label>
                </fieldset>
              </div>
              <p className="scorekeeper-note">Points use ones-and-twos scoring. A made three counts as 2 points and 1 made three.</p>
              <div className="box-score-wrap"><table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th></tr></thead><tbody>
                {roster.map((assignment) => {
                  const box = result.playerStats[assignment.playerId] ?? { playerId: assignment.playerId, points: 0, rebounds: 0, assists: 0, threes: 0 };
                  return <tr key={`${game.id}-${assignment.playerId}`}><td>{assignment.playerName}{assignment.rotationShare < 1 ? " (sub)" : ""}</td>{(["points", "rebounds", "assists", "threes"] as const).map((field) => <td key={field}><input disabled={readOnly} type="number" min="0" value={box[field]} onChange={(event) => updatePlayer(game.id, assignment.playerId, field, Number(event.target.value))} /></td>)}</tr>;
                })}
              </tbody></table></div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function LeaderboardView({ community, results, scenario }: { community: CommunityState | null; results: PersistedState["results"]; scenario: Scenario }): ReactElement {
  if (!community) return <div className="empty-page"><span>◎</span><h2>Shared leaderboard not connected</h2><p>Connect the Google Apps Script URL from your Player Card to activate the party-wide standings.</p></div>;
  const centralized = settleTickets(sharedTickets(community), results);
  const names = new Set([...community.participants, ...centralized.map((ticket) => ticket.participant)]);
  const bettors = [...names].map((name) => {
    const tickets = centralized.filter((ticket) => ticket.participant === name);
    return { name, tickets: tickets.length, ...ledger(tickets) };
  }).sort((a, b) => b.available - a.available || b.profit - a.profit || a.name.localeCompare(b.name));

  const players = new Map<string, { name: string; games: Set<GameId>; points: number; rebounds: number; assists: number; threes: number }>();
  for (const box of community.boxScores.filter((row) => row.scenario === scenario && row.played)) {
    const current = players.get(box.playerId) ?? { name: box.playerName, games: new Set<GameId>(), points: 0, rebounds: 0, assists: 0, threes: 0 };
    current.games.add(box.gameId); current.points += box.points; current.rebounds += box.rebounds; current.assists += box.assists; current.threes += box.threes;
    players.set(box.playerId, current);
  }
  const playerRows = [...players.values()].sort((a, b) => (b.points + b.rebounds + b.assists) - (a.points + a.rebounds + a.assists));
  return (
    <div className="page-stack">
      <div className="page-heading"><span className="eyebrow">Live from Google Sheets</span><h1>Leaderboards</h1><p>Betting standings and tournament stat leaders refresh automatically.</p></div>
      <section className="standings-card leaderboard-card">
        <div className="section-title"><div><span className="eyebrow">The action</span><h2>Betting leaderboard</h2></div><span>{centralized.length} tickets</span></div>
        <div className="bettor-head"><span>Rank / Bettor</span><span>Bets</span><span>Staked</span><span>Profit</span><span>Units</span></div>
        {bettors.map((row, index) => <div className="bettor-row" key={row.name}><span><b>{index + 1}</b>{row.name}</span><span>{row.tickets}</span><span>{money(row.totalStaked)}</span><strong className={row.profit > 0 ? "positive" : row.profit < 0 ? "negative" : ""}>{row.profit > 0 ? "+" : ""}{money(row.profit)}</strong><strong>{money(row.available)}</strong></div>)}
        {!bettors.length && <p className="leaderboard-empty">No centralized bets have been placed yet.</p>}
      </section>
      <section className="standings-card leaderboard-card">
        <div className="section-title"><div><span className="eyebrow">Box scores</span><h2>Player leaderboard</h2></div><span>{scenario}</span></div>
        <div className="player-head"><span>Player</span><span>GP</span><span>PTS</span><span>REB</span><span>AST</span><span>3PM</span><span>PRA</span></div>
        {playerRows.map((row, index) => <div className="player-leader-row" key={row.name}><span><b>{index + 1}</b>{row.name}</span><span>{row.games.size}</span><strong>{row.points}</strong><span>{row.rebounds}</span><span>{row.assists}</span><span>{row.threes}</span><strong>{row.points + row.rebounds + row.assists}</strong></div>)}
        {!playerRows.length && <p className="leaderboard-empty">Player leaders appear after official box scores are marked Played.</p>}
      </section>
    </div>
  );
}

function RulesView(): ReactElement {
  return (
    <div className="page-stack rules-page">
      <div className="page-heading"><span className="eyebrow">How it works</span><h1>House rules</h1><p>A play-money sportsbook built for the bachelor tournament.</p></div>
      <div className="rule-grid">
        <section><span>01</span><h2>Race to 21</h2><p>Inside baskets count 1. Shots beyond the arc count 2. First to 21 or more wins; no win-by-two.</p></section>
        <section><span>02</span><h2>Fouls</h2><p>No free throws. A foul returns possession to the fouled team with no recorded statistic.</p></section>
        <section><span>03</span><h2>Schedule</h2><p>Game 1: A–B. Game 2: B–C. Game 3: C–A. Every team plays twice.</p></section>
        <section><span>04</span><h2>Champion</h2><p>Most wins takes first. A three-way tie uses point differential, then points scored, then a coin flip.</p></section>
        <section><span>05</span><h2>Your 100</h2><p>Every participant begins with 100 units. The progress meter tracks the requirement to put all 100 into action.</p></section>
        <section><span>06</span><h2>Parlays</h2><p>Same-game and cross-game combinations are priced from joint tournament simulations, including correlation.</p></section>
      </div>
      <section className="method-card"><span className="eyebrow">Pricing methodology</span><h2>Not NBA math in a smaller box</h2><p>The model simulates every possession until one team reaches 21 or 22. Player usage, one- and two-point shooting, defense, rebounds, assists, shared form, and fatigue produce coherent game and player outcomes. Lines are generated from 80,000 complete tournament simulations. Ratings come from the published party spreadsheet and remain subjective.</p><p>This is for entertainment only. No real money is accepted or processed.</p></section>
    </div>
  );
}

export default function App(): ReactElement {
  const [persisted, setPersisted] = useState<PersistedState>(() => loadState());
  const [data, setData] = useState<BasketballData | null>(null);
  const [community, setCommunity] = useState<CommunityState | null>(null);
  const [communityError, setCommunityError] = useState("");
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [loadingText, setLoadingText] = useState("Reading the live ratings…");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("sportsbook");
  const [gameId, setGameId] = useState<GameId>("game-1");
  const [selections, setSelections] = useState<MarketSelection[]>([]);
  const [parlayPrice, setParlayPrice] = useState<ParlayPrice | null>(null);
  const [pricing, setPricing] = useState(false);
  const [stake, setStake] = useState("");
  const [toast, setToast] = useState("");
  const [showProfile, setShowProfile] = useState(!persisted.participant);
  const clientRef = useRef<SimulationClient | null>(null);
  const communityModelRef = useRef("");

  const officialResults = useMemo(() => resultsFromCommunity(community) ?? persisted.results, [community, persisted.results]);
  const accountTickets = useMemo(() => {
    if (!community) return persisted.tickets;
    const central = sharedTickets(community).filter((ticket) => ticket.participant === persisted.participant);
    const centralIds = new Set(central.map((ticket) => ticket.id));
    return [...central, ...persisted.tickets.filter((ticket) => !centralIds.has(ticket.id))];
  }, [community, persisted.participant, persisted.tickets]);
  const settledTickets = useMemo(() => settleTickets(accountTickets, officialResults), [accountTickets, officialResults]);
  const account = useMemo(() => ledger(settledTickets), [settledTickets]);
  const requirement = Math.min(100, account.totalStaked);

  useEffect(() => { saveState({ ...persisted, tickets: settledTickets }); }, [persisted, settledTickets]);

  useEffect(() => {
    if (!persisted.sharedApiUrl) { setCommunity(null); setCommunityError(""); return; }
    let cancelled = false;
    const sync = async () => {
      try {
        const next = await loadCommunityState(persisted.sharedApiUrl);
        if (!cancelled) { setCommunity(next); setCommunityError(""); }
      } catch (reason) {
        if (!cancelled) setCommunityError(reason instanceof Error ? reason.message : "Shared sync failed");
      }
    };
    void sync();
    const interval = window.setInterval(sync, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [persisted.sharedApiUrl]);

  useEffect(() => {
    if (!community) return;
    const bradPlays = community.config.BRAD_PLAYS === true || String(community.config.BRAD_PLAYS).toUpperCase() === "TRUE";
    const sharedScenario: Scenario = bradPlays ? "Brad Plays" : "Brad Out";
    if (persisted.scenario !== sharedScenario) setPersisted((current) => ({ ...current, scenario: sharedScenario }));
  }, [community, persisted.scenario]);

  useEffect(() => {
    if (!community || community.players.length < 12 || community.assignments.length < 24) return;
    const signature = JSON.stringify([community.config.MODEL_VERSION, community.players, community.assignments]);
    if (signature === communityModelRef.current) return;
    communityModelRef.current = signature;
    setData({ players: community.players, assignments: community.assignments, source: "google-sheet", loadedAt: community.loadedAt });
  }, [community]);

  useEffect(() => {
    let cancelled = false;
    loadBasketballData().then((loaded) => { if (!cancelled) setData(loaded); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load ratings"));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!data) return;
    clientRef.current?.destroy();
    const client = new SimulationClient();
    clientRef.current = client;
    setSummary(null);
    setSelections([]);
    setParlayPrice(null);
    setLoadingText(`Simulating 80,000 ${persisted.scenario} tournaments…`);
    client.initialize(data, persisted.scenario).then(setSummary).catch((reason) => setError(reason instanceof Error ? reason.message : "Simulation failed"));
    return () => client.destroy();
  }, [data, persisted.scenario]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (selections.length <= 1) { setParlayPrice(null); setPricing(false); return; }
    let cancelled = false;
    setPricing(true);
    clientRef.current?.price(selections.map((item) => item.id))
      .then((price) => { if (!cancelled) setParlayPrice(price); })
      .catch((reason) => { if (!cancelled) setToast(reason.message); })
      .finally(() => { if (!cancelled) setPricing(false); });
    return () => { cancelled = true; };
  }, [selections]);

  const toggleMarket = (market: MarketSelection) => {
    if (isGameLocked(community, market.gameId)) { setToast(`Game ${market.gameNumber} betting is locked`); return; }
    setSelections((current) => {
      if (current.some((item) => item.id === market.id)) return current.filter((item) => item.id !== market.id);
      const withoutOpposite = current.filter((item) => item.groupId !== market.groupId);
      if (withoutOpposite.length >= 6) { setToast("Parlays are limited to 6 legs"); return current; }
      return [...withoutOpposite, market];
    });
  };

  const placeBet = async () => {
    const stakeNumber = Number.parseFloat(stake);
    const price = selections.length === 1 ? {
      fairProbability: selections[0].fairProbability,
      decimalOdds: selections[0].decimalOdds,
      americanOdds: selections[0].americanOdds,
    } : parlayPrice;
    if (!price || !Number.isFinite(stakeNumber) || stakeNumber <= 0 || stakeNumber > account.available) return;
    const ticket: Ticket = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), participant: persisted.participant,
      scenario: persisted.scenario, stake: stakeNumber, decimalOdds: price.decimalOdds, americanOdds: price.americanOdds,
      potentialReturn: Number((stakeNumber * price.decimalOdds).toFixed(2)), fairProbability: price.fairProbability,
      legs: selections.map((market) => ({ marketId: market.id, gameId: market.gameId, kind: market.kind, subject: market.subject, playerId: market.playerId, teamId: market.teamId, stat: market.stat, side: market.side, line: market.line, label: market.label, odds: market.decimalOdds })),
      status: "pending", settledReturn: 0,
    };
    if (persisted.sharedApiUrl) {
      try {
        await submitSharedTicket(persisted.sharedApiUrl, ticket);
      } catch (reason) {
        setToast(reason instanceof Error ? reason.message : "Central bet submission failed");
        return;
      }
    }
    setPersisted((current) => ({ ...current, tickets: [...current.tickets, ticket] }));
    setSelections([]); setStake(""); setToast(`Ticket placed · ${money(stakeNumber)} units`);
    if (persisted.sharedApiUrl) {
      loadCommunityState(persisted.sharedApiUrl).then(setCommunity).catch(() => undefined);
    }
  };

  const refreshData = async () => {
    setLoadingText("Refreshing the published Sheet…"); setSummary(null);
    if (persisted.sharedApiUrl) {
      try {
        const next = await loadCommunityState(persisted.sharedApiUrl);
        setCommunity(next);
        if (next.players.length >= 12 && next.assignments.length >= 24) {
          communityModelRef.current = JSON.stringify([next.config.MODEL_VERSION, next.players, next.assignments]);
          setData({ players: next.players, assignments: next.assignments, source: "google-sheet", loadedAt: next.loadedAt });
        }
        setToast("Shared Google Sheet refreshed");
      } catch (reason) { setCommunityError(reason instanceof Error ? reason.message : "Shared sync failed"); }
      return;
    }
    const loaded = await loadBasketballData(true); setData(loaded);
    setToast(`Ratings refreshed from ${sourceLabel(loaded)}`);
  };

  const setScenario = (scenario: Scenario) => setPersisted((current) => ({ ...current, scenario }));

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setPersisted(await importState(file)); setToast("Backup imported"); }
    catch { setToast("That backup file is invalid"); }
    event.target.value = "";
  };

  if (error) return <main className="fatal"><h1>We hit the rim.</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setTab("sportsbook")}><span className="brand-ball">21</span><span><b>THE BACHELOR BOOK</b><small>Three teams. One champion.</small></span></button>
        <nav>
          {(["sportsbook", "bets", "leaderboard", "tournament", "rules"] as Tab[]).map((item) => <button className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item)}>{item === "sportsbook" ? "Markets" : item === "bets" ? "My bets" : item[0].toUpperCase() + item.slice(1)}</button>)}
        </nav>
        <div className="header-actions">
          <label className="scenario-toggle"><span>Brad</span><select disabled={Boolean(community)} title={community ? "Controlled by App Config in the shared Sheet" : "Local scenario"} value={persisted.scenario} onChange={(event) => setScenario(event.target.value as Scenario)}><option>Brad Out</option><option>Brad Plays</option></select></label>
          <button className="balance-button" type="button" onClick={() => setShowProfile(true)}><span>{persisted.participant || "Player"}</span><strong>{money(account.available)} <small>u</small></strong></button>
        </div>
      </header>

      <div className="status-strip">
        <div><span className={`live-dot ${communityError ? "error-dot" : ""}`}></span>{community ? "Shared Sheet live" : data ? sourceLabel(data) : "Connecting"}{community && <small>synced {nowLabel(community.loadedAt)}</small>}{communityError && <small>{communityError}</small>}</div>
        <div className="wager-progress"><span>100-unit mission</span><div><i style={{ width: `${requirement}%` }}></i></div><b>{money(requirement)}/100</b></div>
        <button type="button" onClick={refreshData} disabled={!data}>↻ Refresh ratings</button>
      </div>

      {!summary || !data ? (
        <main className="loading-screen"><div className="loader-ball">21</div><h1>Building the board</h1><p>{loadingText}</p><div className="loading-line"><i></i></div></main>
      ) : (
        <main className={`main-layout ${tab === "sportsbook" ? "with-slip" : ""}`}>
          {tab === "sportsbook" && <Sportsbook data={data} summary={summary} gameId={gameId} setGameId={setGameId} selections={selections} toggleMarket={toggleMarket} />}
          {tab === "bets" && <TicketsView tickets={settledTickets} results={officialResults} />}
          {tab === "leaderboard" && <LeaderboardView community={community} results={officialResults} scenario={persisted.scenario} />}
          {tab === "tournament" && <TournamentView data={data} scenario={persisted.scenario} results={officialResults} readOnly={Boolean(community)} onResults={(results) => setPersisted((current) => ({ ...current, results }))} />}
          {tab === "rules" && <RulesView />}
          {tab === "sportsbook" && <BetSlip selections={selections} price={parlayPrice} pricing={pricing} stake={stake} available={account.available} onStake={setStake} onRemove={(id) => setSelections((current) => current.filter((item) => item.id !== id))} onClear={() => setSelections([])} onPlace={placeBet} />}
        </main>
      )}

      {showProfile && (
        <div className="modal-backdrop" role="presentation">
          <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <button className="modal-close" type="button" onClick={() => persisted.participant && setShowProfile(false)}>×</button>
            <span className="brand-ball large">21</span><span className="eyebrow">Player card</span><h1 id="profile-title">Welcome to the book</h1><p>Enter a name for this device. Your 100-unit bankroll and tickets stay in this browser.</p>
            <label><span>Display name</span><input autoFocus value={persisted.participant} maxLength={30} placeholder="Your name" onChange={(event) => setPersisted((current) => ({ ...current, participant: event.target.value }))} /></label>
            <label><span>Shared Sheet API URL <small>optional until Apps Script is deployed</small></span><input value={persisted.sharedApiUrl} placeholder="https://script.google.com/macros/s/…/exec" onChange={(event) => setPersisted((current) => ({ ...current, sharedApiUrl: event.target.value.trim() }))} /></label>
            <div className="profile-stats"><div><span>Available</span><strong>{money(account.available)}</strong></div><div><span>Total staked</span><strong>{money(account.totalStaked)}</strong></div><div><span>Tickets</span><strong>{persisted.tickets.length}</strong></div></div>
            <button className="primary-button" type="button" disabled={!persisted.participant.trim()} onClick={() => setShowProfile(false)}>Enter sportsbook</button>
            <div className="backup-actions"><button type="button" onClick={() => exportState({ ...persisted, tickets: settledTickets })}>Export backup</button><label>Import backup<input type="file" accept="application/json" onChange={handleImport} /></label><a href={sheetPublicUrl} target="_blank" rel="noreferrer">Open ratings sheet</a></div>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

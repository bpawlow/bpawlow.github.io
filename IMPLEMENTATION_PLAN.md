# Bachelor Basketball Sportsbook — Implementation Plan

## 1. Product definition

Build a mobile-first, front-end-only React application for a three-team, three-game bachelor-party basketball tournament. Games are played first-to-21-or-more using ones and twos: a conventional two-point basket adds one game point and a conventional three-point basket adds two game points. There is no win-by-two requirement, so a two-point basket at a score of 20 ends the game at 22. There are no free throws; a foul returns the ball to the fouled team. The app reads ratings and configuration from a public Google Sheet, generates pregame lines and player props, lets each participant build straight bets and parlays, calculates prices and payouts, stores each participant's tickets locally, and settles tickets from results entered in Google Sheets.

This is a play-money party app. Each browser profile starts with 100 units. No real-money payments, account system, or server-side security is included.

### Tournament format

1. Game 1: Team 1 vs Team 2; Team 3 bye
2. Game 2: Team 2 vs Team 3; Team 1 bye
3. Game 3: Team 3 vs Team 1; Team 2 bye

Standings award one win per victory. Ranking tie-breakers are:

1. Total point differential
2. Total points scored
3. Coin flip, recorded manually in the sheet if required

### Player scenarios

Brad is the organizer/player whose participation is uncertain. The Google Sheet owns one setting: `BRAD_PLAYS`, defaulting to `FALSE`.

- When false, the app loads the Brad Out rosters.
- When true, the app loads the Brad Plays rosters.
- In the Brad Plays scenario, Berler and Jason are separate prop subjects who split one rotation slot. Their scenario-specific playing-time shares default to 0.50 each and should sum to 1.00. The team model therefore counts one full player slot, while each player receives a reduced individual projection.

Changing `BRAD_PLAYS` changes the active rosters and regenerates every market. Once betting starts, the scenario and model version should be frozen for existing tickets; tickets always retain a snapshot of their original line and odds.

## 2. Important front-end-only constraints

- Google Sheets is the shared read-only configuration and results source.
- Bets, bankroll, participant name, and ticket history live in `localStorage` on each device.
- Clearing browser storage or changing devices loses local tickets unless the user exports a backup.
- There is no trusted server clock, authentication, shared leaderboard, or tamper resistance. A user can alter local data with browser developer tools.
- A public Google Sheet and browser API key cannot safely contain secrets.
- If trustworthy shared standings or bet auditing becomes required, a small backend (for example Firebase, Supabase, or a Google Apps Script web app) becomes necessary and is a separate phase.

For the party version, add JSON export/import and a human-readable ticket receipt so an organizer can recover or verify a participant's bets.

## 3. Recommended technology

- React + TypeScript + Vite, retaining the repository's existing foundation
- React Router with hash routing only if separate URLs become useful; otherwise a single-page tab layout
- Zustand or a small reducer/context store for UI and bet-slip state
- Zod for validating all Google Sheet data before it reaches the pricing model
- Vitest for model/unit tests
- React Testing Library for critical UI flows
- Playwright for a small mobile/desktop smoke suite
- A Web Worker for deterministic tournament simulation without blocking the UI
- Native `fetch` for Google Sheets API reads
- Native `localStorage` behind a versioned persistence adapter

No dedicated parlay-pricing package is recommended. Available public tools either calculate independent-leg payouts, expose proprietary commercial APIs, or require a correlation matrix that we would still need to invent. A custom, seeded tournament simulation gives us auditable joint probabilities and matches this unusual 4-on-4 format.

## 4. Google Sheet contract

Use the published public/view-only workbook at the configured URL. Its verified published tabs are:

| tab | gid |
| --- | --- |
| `READ ME FIRST` | `282444385` |
| `Quick Player Ratings` | `1398010636` |
| `Team Assignments` | `467420035` |
| `Team Ratings` | `167868123` |

The app can fetch each required tab directly as CSV using the published document ID, `gid`, and `output=csv`; this works without an API key or OAuth. `Quick Player Ratings` and `Team Assignments` are currently readable and contain the filled player data. The imported formulas on `Team Ratings` currently return `#NAME?` and zero values, so this tab must not be trusted. The app will derive team ratings directly from the raw player and assignment tabs.

If we later move from published CSV to the Sheets API, use one `spreadsheets.values.batchGet` request and request `UNFORMATTED_VALUE`. A browser API key may be committed as a public runtime value only after it is restricted to the Google Sheets API and the production/local web origins.

### `App Config`

| key | example | purpose |
| --- | --- | --- |
| `BRAD_PLAYS` | `FALSE` | Selects active roster scenario |
| `MODEL_VERSION` | `1` | Invalidates stale cached projections |
| `TOURNAMENT_SEED` | `20260815` | Makes displayed odds deterministic |
| `STARTING_UNITS` | `100` | Initial participant bankroll |
| `STRAIGHT_HOLD` | `0.045` | Two-way market margin |
| `PARLAY_BASE_HOLD` | `0.08` | Additional parlay margin |
| `MAX_PARLAY_LEGS` | `6` | Controls rare-event error and UX |
| `MAX_DECIMAL_ODDS` | `1001` | Maximum offered payout multiplier |
| `SIMULATION_COUNT` | `100000` | Tournament samples generated in worker |
| `TARGET_SCORE` | `21` | Game-ending score threshold |
| `WIN_BY_TWO` | `FALSE` | Whether play continues until a two-point lead |
| `ALLOW_OVERSHOOT` | `TRUE` | Whether a two-point basket at 20 produces 22 |
| `FREE_THROWS` | `FALSE` | Fouls return possession and do not produce free throws |
| `BASE_ONE_POINT_PCT` | calibration value | Baseline inside-the-arc make rate |
| `BASE_TWO_POINT_PCT` | calibration value | Baseline beyond-the-arc make rate |
| `BASE_TWO_POINT_ATTEMPT_RATE` | calibration value | Share of attempts taken beyond the arc |
| `BASE_OFFENSIVE_REBOUND_RATE` | calibration value | Extends possessions and generates rebound props |
| `BASE_ASSIST_RATE` | calibration value | Share of made baskets receiving an assist |

### `Players`

Required columns:

`player_id`, `display_name`, `active`, `overall`, `scoring`, `shooting`, `playmaking`, `defense`, `rebounding`, `stamina`, `confidence`, `notes`

Ratings remain on the existing 1–10 relative-to-this-group scale. Player IDs are stable slugs and must not change when display names are edited.

### `Rosters`

Required columns:

`scenario`, `team_id`, `team_name`, `player_id`, `rotation_share`, `usage_adjustment`, `active`

- `scenario` is `BRAD_OUT` or `BRAD_PLAYS`.
- A normal player has `rotation_share = 1`.
- Berler and Jason each default to `0.5` in the shared-slot scenario.
- `usage_adjustment` defaults to `1` and allows the organizer to encode who actually handles or shoots more without changing raw talent ratings.

### `Schedule`

Required columns:

`game_id`, `game_number`, `team_1_id`, `team_2_id`, `scheduled_at`, `status`, `betting_locked`

`status` is `UPCOMING`, `LIVE`, or `FINAL`. Because the browser clock is not trusted, the organizer-controlled `betting_locked` value is authoritative for the party app.

### `Results`

One row per game plus player stat rows. Required game fields:

`game_id`, `team_1_score`, `team_2_score`, `winner_team_id`, `final`

Required player fields (all points use the tournament's one/two scoreboard units):

`game_id`, `player_id`, `played`, `points`, `rebounds`, `assists`, `three_pointers`

The app derives PRA and other combination stats. Missing player statistics leave affected tickets pending instead of grading them incorrectly.

### `Model Config`

Stores editable calibration values rather than burying them in code:

- Rating weights for offense, defense, usage, rebounding, and stamina
- Possession outcome probabilities and scoring variance
- One-point and two-point attempt/make-rate calibration
- Offensive rebound and assist-rate calibration
- Team shooting/game-form variance
- Player performance variance by confidence level
- Fatigue adjustment for teams playing consecutive games
- Matchup adjustment caps
- Market line increments (0.5 for points/PRA, 0.5 or 1 for counting props)
- Push behavior and overtime inclusion
- SGP/parlay margin curve

The app ships with conservative defaults, but the sheet allows tuning after actual games without a redeploy.

## 5. Projection and simulation model

### 5.1 Pre-simulation projections

1. Select the active scenario and validate that every team has four effective rotation slots.
2. Convert the 1–10 ratings into offense, defense, rebounding, playmaking, usage, and volatility indices.
3. Calculate each team's matchup-neutral strength from its active rotation.
4. Apply opponent defense, rebounding, and pace adjustments.
5. Estimate per-possession scoring efficiency and win probability for each game.
6. Allocate each team projection to players using scoring, shooting, playmaking, rotation share, and usage adjustment.
7. Normalize allocated player points back to the team total so the game line and props cannot contradict each other structurally.

The first release should expose an organizer-only diagnostics panel showing team projections and the sum of player projections. This makes bad inputs obvious.

### 5.2 Coherent tournament simulation

Generate the full three-game tournament in one seeded Web Worker run. Because this is a target-score format, simulate possessions until one team reaches the configured winning condition instead of drawing an NBA-style final score from a clock-based distribution. Each possession selects a ballhandler/shooter and produces one of these outcomes:

- Turnover or empty possession
- Missed one-point attempt
- Missed two-point attempt
- Made one-point basket
- Made two-point basket (also one made “three-pointer” for prop purposes)
- Offensive or defensive rebound after a miss
- An assist assigned to a teammate after an eligible made basket

Ratings influence shot selection, shot success, turnovers/empty possessions, rebound allocation, assist probability, and player usage. The simulation then stops at 21 or the configured overshoot/win-by-two rule. This correctly makes the winner's team total nearly fixed while allowing the loser's total—and therefore the game total and spread—to reflect how competitive the game was.

An ordinary foul is modeled as a possession reset: no shot, point, rebound, assist, or turnover is recorded, and the same team retains the ball. Because there is no game clock, foul resets do not materially alter score or prop distributions in V1 and may be omitted as computationally neutral. They can be added later if fatigue or foul frequency becomes relevant.

Each tournament sample also draws:

- Tournament-level player form, shared across that player's games
- Game pace
- Team shooting/offensive form
- Opponent defensive form
- Player performance and stat allocation noise
- Consecutive-game fatigue where applicable

Each game sample produces team scores and every active player's points, rebounds, assists, made threes, and combo totals. Player scoring is generated by the same possessions that create team scores, so box-score points always reconcile exactly to the final score. A made beyond-the-arc shot counts as one made three-pointer and two tournament points.

This shared sample space is the correlation engine:

- A player's points over and PRA over are strongly positively related.
- A player's points over and the same player's points under cannot coexist.
- Team moneyline and team spread are related.
- Team/player overs and game total are related.
- Teammates compete for finite points, rebounds, and assists.
- Opposing overs can share a high-pace factor.
- The same team's performance in multiple games shares tournament form and fatigue.

### 5.3 Market generation

Initial markets:

- Game: moneyline, spread, total
- Team: team total
- Player: points, rebounds, assists, made threes, points + rebounds (PR), points + assists (PA), rebounds + assists (RA), and points + rebounds + assists (PRA)

For each market:

1. Choose a line near the simulated median using the configured increment.
2. Count win, loss, and push frequency in the simulation output.
3. Convert fair probability to offered probability by applying configured margin.
4. Display American and decimal odds, but use decimal internally.

Do not open a market when the player is inactive, has too little rotation share, or the simulation sample is too uncertain.

### 5.4 Straight pricing

For a two-way market with fair probabilities `p1` and `p2`, normalize after excluding pushes, then apply a target overround so offered implied probabilities sum to `1 + hold`. Moneyline uses the same process. Decimal odds are `1 / offeredProbability`; American odds are derived only for display.

### 5.5 Parlay pricing

For a selected ticket, evaluate all legs against the same tournament simulations:

`fairJointProbability = (jointWins + 0.5) / (eligibleSamples + 1)`

The half-win smoothing avoids an infinite price when a very rare combination has no winners in a finite sample. Apply a configurable parlay margin after calculating the joint probability, then cap maximum odds.

This means we do not multiply straight odds for related legs. Cross-game parlays also use joint simulation, so shared-team and tournament-level effects remain represented.

Reject or disable:

- Directly contradictory outcomes
- Duplicate legs
- A leg whose game has locked
- More than the configured maximum legs
- Parlays with no eligible simulation samples

Push rules:

- Straight push returns stake.
- A push in a parlay removes that leg and reprices/settles the remaining ticket at the ticket's stored joint probabilities where possible.
- If every leg pushes, return stake.

For V1, prefer half-point lines wherever possible to minimize push complexity.

## 6. Bankroll, tickets, and settlement

### Bankroll rules

- Starting cash: 100 units
- Stake precision: 0.1 unit
- Maximum stake: current available cash
- Wagering requirement: cumulative valid stake must reach at least 100 units before Game 3 locks
- Winnings do not increase the 100-unit wagering requirement
- A progress meter shows `units staked / 100`
- The app warns early and blocks leaving an unstaked required balance when the final betting window is about to close

Participants may bet later games before earlier games are played. This ensures all 100 units can be committed even if early tickets lose. Whether settled winnings may be re-bet is configurable; default `TRUE` for a more sportsbook-like experience.

### Ticket snapshot

Each accepted ticket stores:

- UUID and creation timestamp
- Participant display name
- Scenario, sheet model version, and tournament seed
- Stake, decimal/American odds, potential return, and potential profit
- Every leg's game, market, selection, line, and displayed price
- Fair and offered joint probability
- Status: pending, won, lost, push, or void
- Settlement details

The ticket must never be repriced when the sheet changes.

### Settlement

On refresh/sync, load `Results`, grade each leg, settle tickets, update cash, and calculate standings. Settlement functions must be pure and exhaustively unit-tested. A result correction is handled idempotently by recomputing the ledger from the immutable starting balance and ticket history.

## 7. User experience

### Primary screens

1. **Welcome / participant setup** — enter a display name; explain 100-unit play-money bankroll.
2. **Sportsbook** — game tabs, matchup cards, game markets, and expandable player props.
3. **Bet slip** — straight/parlay mode, correlation-aware live repricing, stake, payout, and validation messages.
4. **My bets** — pending and settled tickets with leg-by-leg grading.
5. **Tournament** — schedule, live/final scores, standings, point differential, and tie-break status.
6. **Rules / model info** — concise tournament and betting rules plus a “for entertainment only” note.

Use a sticky mobile bet-slip button and bottom sheet. On desktop, show markets and the bet slip side by side.

### Data states

- Loading/simulating progress
- Last sheet sync time and model version
- Offline mode using the last valid cached sheet payload
- Clear validation errors when the sheet is malformed
- Stale-data warning if the model version changes while a slip is open
- Results pending vs. ticket pending distinction

## 8. Application architecture

```text
src/
  app/                 app shell, routes, providers
  components/          shared UI
  features/
    sportsbook/        market browsing
    bet-slip/           selection and ticket placement
    bankroll/           ledger and wagering requirement
    tickets/            persistence and settlement display
    tournament/         schedule, results, standings
    settings/           diagnostics and data sync
  model/
    ratings.ts          rating transforms
    projections.ts      team/player means
    simulation/         worker, PRNG, distributions, box scores
    markets.ts          line creation and straight pricing
    parlays.ts          joint-event evaluation and margin
    settlement.ts       ticket grading
    standings.ts        tournament tie-breakers
  data/
    googleSheets.ts     batch fetch
    schema.ts           runtime validation
    normalize.ts        sheet rows to domain objects
    cache.ts            last-known-good payload
  store/                UI and persisted ledger state
  types/                domain types
```

Keep mathematical/model modules independent of React so they can be tested with fixed seeds and later moved to a backend without rewriting them.

## 9. Repository replacement and deployment

The current site is a Vite React photo/Valentine app. Implementation will remove its old components, styles, image assets, and thumbnail script. Preserve Git history and the existing GitHub Pages repository.

Update the workflow to current GitHub Pages action versions, build on pushes to `master`, and run typecheck/tests before deployment. Because this is the root `bpawlow.github.io` repository, Vite's base path remains `/`.

No Google credential with write access or service-account JSON may be committed. The public Sheets API key, if used, must be referrer- and API-restricted. Prefer environment substitution at build time even though the resulting key is necessarily visible in browser JavaScript.

## 10. Testing and model acceptance

### Unit tests

- Odds format conversion and payout math
- Overround/margin application
- Spread, total, moneyline, and prop grading
- Push and void behavior
- Correlated joint probability on controlled synthetic samples
- Contradiction detection
- 100-unit ledger and wagering requirement
- Scenario/rotation validation, including Berler/Jason split
- Standings and all three tie-break stages
- Deterministic simulation for a fixed seed

### Integration tests

- Valid and malformed Google Sheet payloads
- Offline cached startup
- Place straight bet and parlay, refresh, and retain state
- Sync final results and settle exactly once
- Change Brad scenario without changing historical tickets
- Correct a result and rebuild ledger idempotently

### Model sanity checks

- Better overall teams should be favored, all else equal.
- Increasing defense should reduce opponent scoring and over probabilities.
- Increasing rotation share should raise counting-stat projections.
- Sum of player expected points should equal team expected points within tolerance.
- Positive-correlation examples should price shorter than independent multiplication.
- Negative-correlation examples should price longer or be rejected if impossible.
- Simulated win rates should converge within a documented Monte Carlo error tolerance.

Before the event, run organizer review with several known player/team comparisons and adjust calibration settings. With no historical game data, the model can be internally coherent but cannot claim sportsbook-level empirical accuracy.

## 11. Delivery phases

### Phase 1 — Data and deterministic model

- Replace old site scaffold and assets
- Add Google Sheet loader, validation, cache, and Brad scenario switch
- Implement roster/team projections and organizer diagnostics
- Implement tournament simulation worker and generated markets
- Add model and data tests

### Phase 2 — Sportsbook and betting

- Build responsive game/prop UI
- Build correlated bet slip and odds conversion
- Implement bankroll, 100-unit requirement, ticket snapshots, and local persistence
- Add export/import backup

### Phase 3 — Results and tournament

- Read results from sheet
- Settle tickets and rebuild bankroll ledger
- Implement standings and tie-break display
- Add lock/status handling and model-version warnings

### Phase 4 — Hardening and launch

- Mobile/desktop end-to-end tests
- Accessibility and error-state pass
- Performance tune simulation worker and payload cache
- Organizer calibration review
- Purge obsolete app code, run full verification, commit, and deploy to GitHub Pages

## 12. Inputs required before implementation

1. Define the scorekeeper's assist and rebound rules consistently enough to settle props
2. Whether users may re-bet winnings; recommended default is yes
3. Whether betting is open for all three games from the start; recommended default is yes
4. Final event date/time zone for displayed lock times
5. App name/theme preference, if any

Items 2, 3, and 5 can use the recommended defaults without blocking engineering. Consistent scorekeeping definitions remain important for prop settlement.

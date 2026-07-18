# Bachelor Book Operator Guide

## The shared-data model

Google Sheets is the event's central datastore. Google Apps Script is a small controlled doorway that lets the React website read current data and append bets. There is no conventional database to administer.

| Data | Source of truth | Editor |
| --- | --- | --- |
| Player ratings | `Quick Player Ratings` | Organizer before betting opens |
| Roster configuration | `App Config!B2` | Organizer before betting opens |
| Betting status | `App Config!B3` and per-game lock cells | Organizer |
| Official scores | `Schedule & Results` | Scorekeeper |
| Official player stats | `Box Scores` | Scorekeeper |
| Participants | `Participants` | Registered automatically from the website; organizer can deactivate |
| Tickets and legs | `Bets` / `Bet Legs` | App through Apps Script |
| Betting leaderboard | Derived from tickets/results | Automatic |
| Player leaderboard | Derived from box scores | Automatic |

## One-time setup

1. Open the currently published Google Sheet.
2. Select **File → Import → Upload** and choose `bachelor_player_ratings_shared.xlsx`.
3. Choose **Replace spreadsheet** so the existing Google Sheet becomes the control-center workbook.
4. Reopen **File → Share → Publish to web** and ensure the entire document is published with automatic republishing enabled.
5. Open **Extensions → Apps Script**.
6. Replace the default script with `google-apps-script/Code.gs` from the repository.
7. Select **Deploy → New deployment → Web app**.
8. Set **Execute as** to yourself and **Who has access** to anyone. Deploy and authorize it.
9. Copy the URL ending in `/exec`.
10. Paste it into `App Config!B7` for reference. The current production URL is embedded in the website, so participants do not need to paste it into their Player Cards.
11. Test the URL by opening it in a browser with `?action=state` appended. It should return JSON containing `"ok":true`.
12. Reload the Google Sheet once so the new **Bachelor Book** organizer menu appears.

Participants do not see or enter the Apps Script URL. It is embedded in the production website.

## Participant names

When someone enters a display name and presses **Enter sportsbook**, the app automatically adds that person to `Participants` with 100 starting units. Matching is case-insensitive, so `Brad` and `brad` cannot become separate accounts. Existing active names are reused with their canonical spelling.

- The organizer does not need to enter names manually.
- Ask everyone to use one recognizable name and not change it after betting.
- Once a participant has staked units, their name field is locked on that browser.
- To block someone, set `Active?` to `FALSE` in `Participants`.

## Before the tournament

1. Decide which roster configuration is active.
2. Set `App Config!B2` to `FALSE` for the default roster or `TRUE` for the alternate roster.
3. Do not change this after accepting bets. If it must change, close betting, increment `MODEL_VERSION`, refresh the website, and void/review tickets created under the previous roster configuration.
4. Set `BETTING_OPEN` to `TRUE`.
5. Confirm all games are `UPCOMING`, scores are blank, `Final?` is false, and the desired games have `Betting Locked?` false.
6. Open the website, press **Refresh ratings**, and verify the header shows **Shared Sheet live** and the expected teams and players.

## Locking and running a game

Immediately before a game begins:

1. Set that game’s `Betting Locked?` to `TRUE`.
2. Change its status to `LIVE`.
3. The website will reject new selections containing that game after the next shared sync.

After the game:

1. Enter the final team scores in `Schedule & Results`.
2. Go to `Box Scores` and filter to the correct `Game ID` and active roster configuration.
3. Mark `Played?` true for each person who appeared.
4. Enter:
   - `Points`: scoreboard points; inside basket = 2, beyond the arc = 3
   - `Rebounds`: offensive plus defensive rebounds
   - `Assists`: final pass directly creating a made basket
   - `Three Pointers`: number of made shots beyond the arc, not the number of scoreboard points
5. For the shared Berler/Jason slot, mark both Played if both appeared and record each person’s actual stats.
6. Return to `Schedule & Results`. Verify `Team 1 Box Points` and `Team 2 Box Points` equal the official scores.
7. Do not mark Final if `Reconciliation` says `CHECK PLAYER POINTS`.
8. Once checked, set `Final?` true, status to `FINAL`, and optionally enter an Updated At timestamp.

The Apps Script will grade affected legs and tickets during the next sync. The website refreshes every 30 seconds, and you can also press **Refresh ratings**.

## Available game markets

The board offers winner, spread, and full-game total markets. Team totals are intentionally excluded: in a first-to-21 format, every winning team finishes from 21 through 23, making its team total largely a duplicate of the moneyline and unusually sensitive to the final basket. Previously accepted team-total tickets remain supported by settlement logic.

All straight markets—including game lines and player props—use a configurable 6% default two-sided overround after the simulation calculates fair probabilities. Player lines are selected from the simulated half-point line closest to a 50/50 outcome; the points 55%, rebounds 62%, assists 66%, 3PM 62%, and combo 58% settings are only tie-break preferences for discrete distributions. This keeps both sides near even odds instead of forcing a higher line that creates heavy plus/minus prices. The model gives individual playmaking, rebounding, scoring, and shooting ratings direct influence over who receives production; team assist totals are only used to determine how many made baskets receive an assist, not to create a team-assists betting market. It also uses pickup-game priors for missed shots, three-point attempts, assists, and offensive rebounds. Parlays are priced from their joint simulated outcomes so correlation is included, then receive a separate 8% default parlay margin that increases modestly for additional legs.

The pricing controls are in `App Config`. Adjust them only after reviewing test lines and preserving the same settings for all accepted tickets.

The app blocks a favorite spread combined with the opposing team’s moneyline because those selections cannot both win. An underdog spread plus the opposing favorite moneyline remains allowed because that combination can win together.

## Team display names

Edit team names in one place only: the `Value` cells beside `TEAM_A_NAME`, `TEAM_B_NAME`, and `TEAM_C_NAME` on `App Config`. If these rows do not yet exist, the latest Apps Script creates them during the next website sync.

The script copies those central names into every `Team 1`, `Team 2`, and `Bye` position in `Schedule & Results`. The website then uses them in game tabs, matchup headers, markets, standings, Tournament cards, and My Bets. Existing tickets keep their original odds and canonical team identity, but display the current team name.

Do not manually maintain the repeated team-name cells in `Schedule & Results`, because the script will synchronize them from `App Config`. Do not rename Team A/B/C in `Team Assignments`; those values are stable internal identifiers connecting players to the pricing and settlement models.

## Changing teams, matchups, and adding games

The tournament uses three stable internal team IDs: `Team A`, `Team B`, and `Team C`. Display names can change independently.

To move a player for the whole tournament:

1. Close betting for the affected games.
2. In `Team Assignments`, edit the player’s `Team` value for the applicable roster configuration.
3. Remove the player’s old assignment and add a replacement/swap if each team must remain full.
4. Repeat the change in the alternate roster configuration if Brad’s roster is also affected.
5. Confirm each team has the intended players and no player appears twice in that scenario.
6. Increment `MODEL_VERSION` and refresh the website.

Use only the stable IDs `Team A`, `Team B`, and `Team C` in the Team column. Do not change those IDs to the public display names.

To add or rearrange a game, add or edit one row in `Schedule & Results`:

- Give it a unique `Game ID` such as `game-4` and the next `Game #`.
- Set `Game Type` to `TOURNAMENT`, `CHAMPIONSHIP`, or `EXHIBITION`.
- Enter canonical `Team 1 ID`, `Team 2 ID`, and optionally `Bye ID`.
- Set `Counts Toward Standings?` and `Betting Enabled?` explicitly.
- Leave scores blank, `Final?` false, and `Betting Locked?` false until ready.

The visible team-name columns are synchronized automatically from `App Config`; edit the ID columns to change a matchup. The website displays the added marketable game after its next shared sync. The latest Apps Script also creates missing box-score rows for the new game.

For a one-game mixed roster:

1. Close betting for that game.
2. In `Game Rosters`, add or edit rows with the game ID, `DEFAULT` or `ALTERNATE` roster configuration, canonical team ID, player, and rotation share.
3. Enter only the player(s) who moved or changed. The app merges those rows into the default roster and removes each overridden player from their former team.
4. Leave the bye team out of the game-specific rows.
5. Increment `MODEL_VERSION` and refresh the website.

For example, if Peter moves from Team A to Team B in `game-2`, enter one `game-2` / `DEFAULT` row for Peter with `Team ID = Team B`. The default rows remain active for every other player. If no game-specific rows remain for a game/configuration, the app falls back entirely to `Team Assignments`.

For a last-minute change to an upcoming game, use `Game Rosters` instead of rewriting completed-game assignments or historical box scores. Existing tickets retain their original labels, odds, and canonical team identity. Verify the updated markets and roster before reopening betting. Use `EXHIBITION` plus `Counts Toward Standings? = FALSE` for a casual post-tournament game. A championship can be counted or excluded according to the organizer’s choice.

After changing rosters or model settings, increment `MODEL_VERSION`, refresh the website, and do not change accepted betting assumptions without closing betting and reviewing existing tickets. Player lines are always selected near the simulated 50/50 threshold; there are no editable quantile settings. The most useful advanced controls are `ASSIST_ROLE_EXPONENT`, `ASSIST_ROLE_WEIGHT`, `REBOUND_ROLE_EXPONENT`, and `REBOUND_ROLE_WEIGHT`, which adjust how strongly elite playmakers and rebounders receive individual credit. The points and three-point sensitivity controls are calibration-only; leave them at their defaults unless you are deliberately recalibrating the model.

The temporary `*_LINE_OFFSET` settings are deprecated and should not be added back to `App Config`. The reverted Apps Script removes any remaining offset rows during its next state sync.

## Beer Olympics

Beer Olympics is a separate competition using the same Team A/Team B/Team C IDs and display names. The app does not display or enforce the house rules; the Sheet is only used for schedule, matchup, odds, and result entry.

### Initial setup

1. Deploy the latest `google-apps-script/Code.gs`.
2. Refresh the app or call the shared API once. The script creates `Beer Olympics Config`, `Beer Schedule & Results`, `Beer Moneylines`, and `Beer Die Props` if they do not exist.
3. Set `Beer Olympics Config!B2` (`BEER_OLYMPICS_ENABLED`) to `TRUE` when the Beer tab should be visible.
4. Enter manual American odds in `Beer Moneylines` for the two teams in each matchup.
5. Set `Beer Olympics Config!B5` (`BEER_PARLAY_ENABLED`) to `FALSE` if Beer markets should only be available as straight bets.

The starter schedule contains five events with three head-to-head matchups each: Kayak Race / Battle Royale, Beer Chug + Cornhole, Beer Die, Spikeball, and Beer Football. Edit the matchup rows or add rows if the day’s order changes. Use the canonical Team ID columns; the visible team names synchronize from `App Config`.

### Game-day result entry

In `Beer Schedule & Results`, enter the winning Team ID and optionally enter each team’s score or time. Scores are informational; the Winner Team ID is what settles the moneyline and updates standings. Mark `Final?` TRUE only after the winner is confirmed. `Counts Toward Standings?` controls whether that matchup contributes one win and one loss.

Beer standings intentionally use wins and losses only. They do not use score, time, point differential, or Beer Die statistics. Equal win totals remain tied.

### Beer Die props

Use one row per manual team-level or matchup-level prop in `Beer Die Props`:

- Use `Market Type = yes-no` for corner-cup and self-sink markets, then fill `Yes American Odds`, `No American Odds`, and later `Winning Side`.
- Use `Market Type = over-under` for total Fifa markets, then fill `Line`, both odds, and later `Actual Result Value`.
- Set `Betting Enabled?` and `Betting Locked?` before accepting bets.
- Mark `Final?` TRUE only after the organizer has entered the official result.

The website will display only complete, enabled markets. Beer moneylines and props use the manual odds entered in the Sheet; they are not generated by the basketball simulation.

### Betting and settlement

Beer tickets use the same participant wallet, 100-unit requirement, bet slip, shared Bets ledger, and betting leaderboard as basketball tickets. Beer-only parlays compound the manually entered decimal prices. Mixed Beer/basketball parlays are supported when Beer parlays are enabled, but they do not receive a Beer-specific correlation model.

## Leaderboards

The website’s Leaderboard screen has two tables:

- **Betting leaderboard:** units available and profit after settled tickets, ordered by bankroll.
- **Player leaderboard:** games, points, rebounds, assists, made threes, and PRA for the active roster configuration.

The spreadsheet contains equivalent `Betting Leaderboard` and `Player Leaderboard` tabs. The Apps Script rewrites these tabs during each website/API sync from `Bets`, `Bet Legs`, `Participants`, and `Box Scores`; do not manually edit their calculated output.

## Bankroll and bet management

- Each participant starts with 100 units.
- Apps Script checks the shared `Bets` ledger before accepting a ticket, preventing a bettor from staking more than the shared available balance.
- Every ticket stores the original roster configuration, odds, stake, payout, model version, and immutable leg details.
- Do not manually alter `Bets` or `Bet Legs` during play unless correcting an organizer-confirmed data error.
- If a result is corrected, the settlement pass recomputes ticket states from the official records.

## Removing a test participant

In the Google Sheet, open **Bachelor Book → Remove a participant**, enter the exact name, and confirm. The organizer action removes the row from `Participants`, but only if that person has no bets. The website removes them from the leaderboard on its next sync.

If the participant has already submitted a test bet, use **Bachelor Book → Delete a bet** first. Then run **Remove a participant**. This preserves the betting ledger and prevents a participant with historical bets from being silently erased.

### Permanently deleting a mistaken bet

Use the organizer-only menu in the Google Sheet:

1. Open `Bets` and copy the exact value from the mistaken ticket's `Bet ID` column.
2. In the Google Sheet menu bar, select **Bachelor Book → Delete a bet**.
3. Paste the Bet ID and select **OK**.
4. Review the confirmation and select **Yes**.
5. The script permanently deletes the ticket from `Bets` and every matching row from `Bet Legs`.
6. Wait up to 30 seconds or press **Refresh ratings** in the website.

The participant's available units are recalculated automatically, and the deleted ticket disappears from My Bets and the leaderboard. If the **Bachelor Book** menu is missing, reload the spreadsheet after saving the latest `Code.gs`. Do not delete only the `Bets` row manually; orphaned `Bet Legs` rows would remain.

## Rating management

Every shared sync automatically normalizes each skill category to a group average of 5. The normalization preserves ordering and relative gaps while removing category-wide inflation. Changing any yellow player-rating cell therefore triggers a fresh normalization and, after sync, a complete 80,000-simulation repricing.

- `Rating Normalization` is a historical audit of the workbook's original one-time adjustment. It is not used by the app or Apps Script and does not update after later edits.
- You do not need to manage this tab. It may be hidden or deleted without affecting ratings, lines, props, or settlement.
- If changing a player later, evaluate them relative to this group: 5 is group average, not average recreational basketball ability.
- You do not need to rerun the workbook-building script or manually edit the normalization tab after a rating change.
- After material rating changes, increment `MODEL_VERSION`, refresh the website, and avoid changing already accepted ticket lines.
- Confidence controls projection volatility; it does not mean talent level.

## Important security limitation

This is party-grade infrastructure. The Sheet is public and the Apps Script endpoint accepts anonymous requests because a fully front-end app cannot safely hold a secret. The script validates duplicate ticket IDs, bankroll, active roster configuration, and game locks, but a technically motivated guest could still fabricate requests.

For a friendly bachelor-party contest, organizer review of the `Bets` sheet is usually sufficient. Strong authentication would require Google sign-in or a real backend.

## Recovery

- Each participant can export a local JSON backup from the Player Card.
- The central Google Sheet retains accepted bets even if a participant clears browser storage.
- If shared sync is unavailable, the website continues with cached ratings and local tickets, but those bets are not central until submitted successfully.

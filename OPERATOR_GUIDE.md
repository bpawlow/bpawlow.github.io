# Bachelor Book Operator Guide

## The shared-data model

Google Sheets is the event's central datastore. Google Apps Script is a small controlled doorway that lets the React website read current data and append bets. There is no conventional database to administer.

| Data | Source of truth | Editor |
| --- | --- | --- |
| Player ratings | `Quick Player Ratings` | Organizer before betting opens |
| Brad scenario | `App Config!B2` | Organizer before betting opens |
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

1. Decide whether Brad is playing.
2. Set `App Config!B2`:
   - `FALSE` = Brad Out rosters
   - `TRUE` = Brad Plays rosters
3. Do not change this after accepting bets. If it must change, close betting, increment `MODEL_VERSION`, refresh the website, and void/review old-scenario tickets.
4. Set `BETTING_OPEN` to `TRUE`.
5. Confirm all games are `UPCOMING`, scores are blank, `Final?` is false, and the desired games have `Betting Locked?` false.
6. Open the website, press **Refresh ratings**, and verify the header shows **Shared Sheet live** and the correct Brad scenario.

## Locking and running a game

Immediately before a game begins:

1. Set that game’s `Betting Locked?` to `TRUE`.
2. Change its status to `LIVE`.
3. The website will reject new selections containing that game after the next shared sync.

After the game:

1. Enter the final team scores in `Schedule & Results`.
2. Go to `Box Scores` and filter to the correct `Game ID` and active Brad scenario.
3. Mark `Played?` true for each person who appeared.
4. Enter:
   - `Points`: party scoreboard points; inside basket = 1, beyond the arc = 2
   - `Rebounds`: offensive plus defensive rebounds
   - `Assists`: final pass directly creating a made basket
   - `Three Pointers`: number of made shots beyond the arc, not the number of scoreboard points
5. For the shared Berler/Jason slot, mark both Played if both appeared and record each person’s actual stats.
6. Return to `Schedule & Results`. Verify `Team 1 Box Points` and `Team 2 Box Points` equal the official scores.
7. Do not mark Final if `Reconciliation` says `CHECK PLAYER POINTS`.
8. Once checked, set `Final?` true, status to `FINAL`, and optionally enter an Updated At timestamp.

The Apps Script will grade affected legs and tickets during the next sync. The website refreshes every 30 seconds, and you can also press **Refresh ratings**.

## Team display names

The `Team 1`, `Team 2`, and `Bye` values in `Schedule & Results` are the shared display names. Updating those cells updates game tabs, matchup headers, team-grouped player props, market labels, standings, and Tournament cards after the next sync.

Enter each name consistently in these positions:

| Canonical team | Game 1 | Game 2 | Game 3 |
| --- | --- | --- | --- |
| Team A | `Team 1` | `Bye` | `Team 2` |
| Team B | `Team 2` | `Team 1` | `Bye` |
| Team C | `Bye` | `Team 2` | `Team 1` |

Do not rename Team A/B/C in `Team Assignments`; those values are stable internal identifiers connecting players to the pricing model. Existing accepted tickets retain their original labels, while newly generated markets use the updated names.

## Leaderboards

The website’s Leaderboard screen has two tables:

- **Betting leaderboard:** units available and profit after settled tickets, ordered by bankroll.
- **Player leaderboard:** games, points, rebounds, assists, made threes, and PRA for the active Brad scenario.

The spreadsheet contains equivalent `Betting Leaderboard` and `Player Leaderboard` tabs. Do not manually edit their calculated output.

## Bankroll and bet management

- Each participant starts with 100 units.
- Apps Script checks the shared `Bets` ledger before accepting a ticket, preventing a bettor from staking more than the shared available balance.
- Every ticket stores the original scenario, odds, stake, payout, model version, and immutable leg details.
- Do not manually alter `Bets` or `Bet Legs` during play unless correcting an organizer-confirmed data error.
- If a result is corrected, the settlement pass recomputes ticket states from the official records.

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

This is party-grade infrastructure. The Sheet is public and the Apps Script endpoint accepts anonymous requests because a fully front-end app cannot safely hold a secret. The script validates duplicate ticket IDs, bankroll, active scenario, and game locks, but a technically motivated guest could still fabricate requests.

For a friendly bachelor-party contest, organizer review of the `Bets` sheet is usually sufficient. Strong authentication would require Google sign-in or a real backend.

## Recovery

- Each participant can export a local JSON backup from the Player Card.
- The central Google Sheet retains accepted bets even if a participant clears browser storage.
- If shared sync is unavailable, the website continues with cached ratings and local tickets, but those bets are not central until submitted successfully.

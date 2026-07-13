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
| Participants | `Participants` | Organizer |
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
10. Paste it into `App Config!B7` for reference and into the website’s Player Card under **Shared Sheet API URL**.
11. Test the URL by opening it in a browser with `?action=state` appended. It should return JSON containing `"ok":true`.
12. Add every bettor to `Participants`. Use exactly the same spelling they will enter in the app.

For the cleanest event experience, embed the final Apps Script URL in the app after setup so guests do not have to paste it. Until then, it is saved once per browser in the Player Card.

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

## Rating management

The normalized skill cells have a cross-group average near 5. The normalization preserved the original ordering, ties, and differences while removing category-wide inflation.

- Use `Rating Normalization` to compare every original and adjusted value.
- If changing a player later, evaluate them relative to this group: 5 is group average, not average recreational basketball ability.
- After material rating changes, increment `MODEL_VERSION`, refresh the website, and avoid changing already accepted ticket lines.
- Confidence controls projection volatility; it does not mean talent level.

## Important security limitation

This is party-grade infrastructure. The Sheet is public and the Apps Script endpoint accepts anonymous requests because a fully front-end app cannot safely hold a secret. The script validates duplicate ticket IDs, bankroll, active scenario, and game locks, but a technically motivated guest could still fabricate requests.

For a friendly bachelor-party contest, organizer review of the `Bets` sheet is usually sufficient. Strong authentication would require Google sign-in or a real backend.

## Recovery

- Each participant can export a local JSON backup from the Player Card.
- The central Google Sheet retains accepted bets even if a participant clears browser storage.
- If shared sync is unavailable, the website continues with cached ratings and local tickets, but those bets are not central until submitted successfully.

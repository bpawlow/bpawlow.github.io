# The Bachelor Book

A front-end-only, play-money sportsbook for a three-team first-to-21 basketball tournament.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The app reads the published player and team tabs, runs 80,000 seeded tournament simulations in a Web Worker, and prices straight bets and parlays from the resulting joint outcomes. Browser storage contains each participant's bankroll, tickets, and locally entered results.

Pushes to `master` deploy through the GitHub Pages workflow.

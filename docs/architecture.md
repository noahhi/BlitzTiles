# BlitzTiles Architecture Notes

## Monorepo Structure

- `packages/shared` — Pure game logic + types, zero dependencies
- `packages/client` — React 18 + Vite + Zustand frontend
- `packages/server` — PartyKit placeholder (not actively used yet)

## Networking (as of Feb 2026)

- **PeerJS (WebRTC P2P)**, NOT PartyKit/partysocket
- Host runs game engine locally + broadcasts filtered `ClientGameState` to guest
- Guest sends intents only (`SUBMIT_MOVE`, `PASS`, `EXCHANGE`, `RESIGN`)
- Message buffering + `REQUEST_SYNC` for reconnection/state reconciliation
- `useGameConnection.ts` manages PeerJS connection lifecycle

## Game Store Modes

`useGameStore.ts` supports three modes via `GameMode` type:

- **local**: Both players on same device, engine runs directly
- **host**: Runs engine locally, sends filtered state to guest via WebRTC
- **guest**: Sends intents to host, receives `ClientGameState` updates

## Key Patterns

- `GameConfig` requires ALL fields (no optional props) — tests must include every field
- `syncFromGameState()` / `syncFromClientGameState()` extract store-shaped data from engine state
- `filterStateForPlayer()` creates `ClientGameState` (hides opponent hand) for network sends
- Module-level `setTimeout` for turn timeout scheduling (outside Zustand store)
- All game engine functions are pure: state + action → new state

## Timer System

- Per-turn model: 60s fresh each turn, auto-pass on expiry via `handleTurnTimeout`
- `useTimer` hook: rAF-based, wall-clock computed, returns urgency/progress/display
- Host is authoritative for timeouts; guest only shows local countdown
- `scheduleTurnTimeout` called after every state-changing action in local/host modes

## Commands

```bash
pnpm install              # Install all deps
pnpm test                 # Run all tests
pnpm --filter shared test # Shared tests only
pnpm dev                  # Client dev server
pnpm typecheck            # TypeScript check all packages
pnpm lint                 # Run ESLint
pnpm format               # Run Prettier
```

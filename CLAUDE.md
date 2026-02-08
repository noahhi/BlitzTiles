# BlitzTiles — AI Agent Guide

## What is this project?

BlitzTiles is a crossword-style word game with blitz-chess style move clocks. It's a mobile-friendly web app where players can jump in without accounts, share a link to invite an opponent, and play with time pressure.

## Architecture

### Monorepo structure (pnpm workspaces)

```
packages/
  shared/   — Pure game logic + types. No runtime dependencies. Used by client.
  client/   — React + Vite frontend. Imports from @blitztiles/shared.
```

### Tech stack

- **Frontend**: React 18 + TypeScript + Vite
- **State**: Zustand
- **Drag-and-drop**: @dnd-kit (touch-first)
- **Networking**: PeerJS (WebRTC P2P) — host-to-guest direct connection
- **Routing**: react-router-dom
- **Testing**: Vitest
- **Dictionary**: ENABLE word list (~172K words, public domain)

### Key design decisions

1. **Host-authoritative**: The host player runs the game engine and owns ALL game state. The guest sends intents (`SUBMIT_MOVE`, `PASS`, `EXCHANGE`), the host validates via shared engine and broadcasts results. No central server required — connections are peer-to-peer via PeerJS/WebRTC.

2. **Shared game engine**: `packages/shared/src/gameEngine.ts` is a pure state machine. Every function takes state + action → returns new state. Used by host for real validation and by client for local hot-seat mode.

3. **Per-turn timer**: Each turn gets a fresh 60 seconds (configurable via `turnTimeLimitMs` in `GameConfig`). Auto-passes on expiry (two consecutive auto-passes end the game). In online mode, the host runs `setTimeout` and is authoritative; the guest shows a local countdown only. Client uses `requestAnimationFrame` for smooth wall-clock-based display.

4. **Client networking**: PeerJS (WebRTC) for P2P multiplayer with message buffering and REQUEST_SYNC for state reconciliation.

5. **Racing mode**: Simultaneous-play variant where both players see the same shared rack and race to submit a valid word first. Round-based with 30s timeouts. Two consecutive skipped rounds end the game. Engine in `racingEngine.ts`.

6. **Spectator mode**: Read-only observers join via spectator link. Host controls hand visibility via `spectatorHandsVisible` config. Spectators see ghost tiles (live placement previews from active players). Multiple simultaneous spectators supported.

7. **Store modularity**: `useGameStore` refactored into focused modules (`storeTypes`, `stateSync`, `broadcast`, `turnTimeout`, `hostMessageHandler`, `guestMessageHandler`, `spectatorMessageHandler`) to reduce merge conflicts and keep each concern isolated.

## Commands

```bash
pnpm install              # Install all deps
pnpm test                 # Run all tests (vitest across all packages)
pnpm --filter shared test # Run shared package tests only
pnpm dev                  # Start client dev server (Vite)
pnpm build                # Build all packages
pnpm typecheck            # TypeScript check all packages
```

## Package details

### @blitztiles/shared

Pure TypeScript, zero dependencies. All exports from `packages/shared/src/index.ts`.

Key modules:

- `types.ts` — All TypeScript types: Tile, GameState, PlayerState, GameVariant, SpectatorGameState, ClientMessage/ServerMessage unions
- `constants.ts` — Tile distribution (100 tiles), 15×15 bonus square map, game defaults
- `tileBag.ts` — createTileBag(), drawTiles(), exchangeTiles() — all take+return a PRNG seed for determinism
- `words.ts` — Trie class for O(k) word lookup, loadDictionary() parser
- `board.ts` — isValidPlacement(), getFormedWords() — pure functions over board 2D array
- `scoring.ts` — scoreTurn() with DL/TL/DW/TW bonuses, 50-point all-tiles bonus
- `gameEngine.ts` — createGame(), submitMove(), passTurn(), exchangeTiles(), handleTurnTimeout(), checkEndConditions()
- `racingEngine.ts` — createRacingGame(), submitRacingMove(), handleRacingRoundTimeout(), checkRacingEndConditions()

### @blitztiles/client

React SPA. Pages: HomePage (create/join/spectate), GamePage (play). All hooks in `src/hooks/`.

Key files:

- `useGameStore.ts` — Zustand store orchestrator. Supports 4 modes: local, host, guest, spectator. Imports from modular helpers below.
- `storeTypes.ts` — `GameMode` type (`'local' | 'host' | 'guest' | 'spectator'`), `GameStore` interface, `INITIAL_STATE`
- `stateSync.ts` — `syncFromGameState()`, `syncFromClientGameState()`, `syncFromSpectatorGameState()`, `filterStateForPlayer()`, `filterStateForSpectator()`
- `broadcast.ts` — `broadcastToSpectators()`, `broadcastGhostTilesToSpectators()`, `persistGameSession()`, `clearSession()`
- `turnTimeout.ts` — `scheduleTurnTimeout()`, `scheduleRacingRoundTimeout()`, `clearTurnTimeout()` — module-level timers
- `hostMessageHandler.ts` — Processes guest intents through game engine, broadcasts results to guests and spectators
- `guestMessageHandler.ts` — Receives state updates from host, syncs local store
- `spectatorMessageHandler.ts` — Receives read-only state + ghost tiles from host
- `sessionPersistence.ts` — localStorage session save/load/clear for reconnection (host saves full state, guest saves filtered)
- `useGameConnection.ts` — PeerJS WebRTC connection for host/guest/spectator roles, message buffering, reconnection, REQUEST_SYNC
- `useTimer.ts` — `requestAnimationFrame` countdown hook, reads `turnStartTimestamp`/`turnTimeLimitMs` from store, returns `display`, `urgency`, `progress`, `isRunning`

## Game rules quick reference

- 15×15 board, BlitzTiles bonus layout (symmetric)
- 100 tiles (standard distribution), 2 blanks (0 pts, wild)
- Hand size: 7
- First move must cover center square (7,7)
- Tiles placed must form single row or column, contiguous, connected to existing tiles
- Bonuses (DL/TL/DW/TW) apply only on the turn they're first covered
- 50-point bonus for using all 7 tiles in one turn
- Per-turn timer: 60 seconds per turn (default), auto-pass on expiry
- Game ends when: bag empty + player plays last tile, two consecutive passes, timer expires, or resignation
- **Racing mode**: shared rack visible to both players, first valid submission wins the round, 30s round timer, two consecutive skipped rounds ends game, bag empty + rack empty ends game

## Conventions

- Prefer small, focused files — one module per concern
- All game logic in shared/ must be pure functions (no side effects, no I/O)
- Tests colocated: `foo.ts` → `foo.test.ts` in same directory
- Discriminated unions for all message types (tagged with `type` field)
- Board coordinates: row 0–14 (top to bottom), col 0–14 (left to right)
- Center square is (7, 7)

## Documentation maintenance

When making code changes that affect architecture, types, game rules, or module structure, **you must update the relevant documentation files**:

- `CLAUDE.md` — project-level docs (key design decisions, package details, game rules, conventions)
- Auto memory files (`MEMORY.md`, `architecture.md`, `patterns.md`) — quick reference, architecture details, patterns and gotchas

Examples of changes that require doc updates: adding new types/exports to shared, adding new store modules or hooks, changing game rules or modes, adding new message types, modifying GameConfig fields.

## Commit strategy

- Many small commits, each self-contained and passing tests
- Commit messages describe what changed and why
- Each commit should leave the project in a buildable state

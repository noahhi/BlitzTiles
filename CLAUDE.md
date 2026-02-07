# BlitzTiles — AI Agent Guide

## What is this project?

BlitzTiles is a Scrabble-like word game with blitz-chess style move clocks. It's a mobile-friendly web app where players can jump in without accounts, share a link to invite an opponent, and play with time pressure.

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

- `types.ts` — All TypeScript types: Tile, GameState, PlayerState, ClientMessage/ServerMessage unions
- `constants.ts` — Tile distribution (100 tiles), 15×15 bonus square map, game defaults
- `tileBag.ts` — createTileBag(), drawTiles(), exchangeTiles() — all take+return a PRNG seed for determinism
- `words.ts` — Trie class for O(k) word lookup, loadDictionary() parser
- `board.ts` — isValidPlacement(), getFormedWords() — pure functions over board 2D array
- `scoring.ts` — scoreTurn() with DL/TL/DW/TW bonuses, 50-point all-tiles bonus
- `gameEngine.ts` — createGame(), submitMove(), passTurn(), exchangeTiles(), handleTurnTimeout(), checkEndConditions()

### @blitztiles/client

React SPA. Pages: HomePage (create/join), GamePage (play). Key hooks:

- `useGameStore.ts` — Zustand store, can drive local hot-seat OR networked play. Includes turn timeout scheduling (`setTimeout` auto-pass for local/host modes).
- `useGameConnection.ts` — PeerJS WebRTC connection, translates host messages → store updates, message buffering + REQUEST_SYNC
- `useTimer.ts` — `requestAnimationFrame` countdown hook, reads `turnStartTimestamp`/`turnTimeLimitMs` from store, returns `display`, `urgency`, `progress`, `isRunning`

## Game rules quick reference

- 15×15 board, standard Scrabble bonus layout (symmetric)
- 100 tiles (standard distribution), 2 blanks (0 pts, wild)
- Hand size: 7
- First move must cover center square (7,7)
- Tiles placed must form single row or column, contiguous, connected to existing tiles
- Bonuses (DL/TL/DW/TW) apply only on the turn they're first covered
- 50-point bonus for using all 7 tiles in one turn
- Per-turn timer: 60 seconds per turn (default), auto-pass on expiry
- Game ends when: bag empty + player plays last tile, two consecutive passes, timer expires, or resignation

## Conventions

- Prefer small, focused files — one module per concern
- All game logic in shared/ must be pure functions (no side effects, no I/O)
- Tests colocated: `foo.ts` → `foo.test.ts` in same directory
- Discriminated unions for all message types (tagged with `type` field)
- Board coordinates: row 0–14 (top to bottom), col 0–14 (left to right)
- Center square is (7, 7)

## Commit strategy

- Many small commits, each self-contained and passing tests
- Commit messages describe what changed and why
- Each commit should leave the project in a buildable state

# BlitzTiles

A crossword-style word game with blitz-chess style move clocks. Play fast-paced word battles with time pressure adding a strategic dimension beyond traditional word games.

## Features

- 🎮 **Classic Word Gameplay** — 15×15 board, balanced tile distribution and bonus squares
- ⏱️ **Blitz Mode Timers** — Move clocks add urgency and strategic depth
- 📱 **Mobile-First Design** — Touch-optimized drag-and-drop interface
- 🔗 **Instant Multiplayer** — No accounts needed, just share a link
- 🌐 **Peer-to-Peer** — WebRTC multiplayer via PeerJS, no central server needed
- 🎯 **Host-Authoritative** — All game logic validated by the host for fair play
- 📖 **172K+ Word Dictionary** — ENABLE word list (public domain)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/noahhi/BlitzTiles.git
cd BlitzTiles

# Install dependencies
pnpm install
```

### Development

```bash
# Start the client (React + Vite)
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Build for production
pnpm build
```

## Architecture

BlitzTiles is built as a monorepo using pnpm workspaces:

```
packages/
  shared/   — Pure game logic + types (used by client)
  client/   — React + Vite frontend
```

### Tech Stack

#### Frontend

- **React 18** + **TypeScript** — UI framework
- **Vite** — Build tool and dev server
- **Zustand** — Minimal state management (~1KB)
- **@dnd-kit** — Touch-first drag-and-drop
- **react-router-dom** — Client-side routing

#### Networking

- **PeerJS** — WebRTC P2P connections (host-to-guest direct)

#### Testing

- **Vitest** — Fast unit testing

### Key Design Decisions

1. **Host-Authoritative**: The host player runs the game engine and owns all game state. The guest sends intents (`SUBMIT_MOVE`, `PASS`, `EXCHANGE`), the host validates via shared engine and broadcasts results. No central server required — connections are peer-to-peer via PeerJS/WebRTC.

2. **Shared Game Engine**: `packages/shared/src/gameEngine.ts` is a pure state machine. Every function takes state + action → returns new state. Used by host for real validation and by client for local hot-seat mode.

3. **Per-Turn Timer**: Each turn gets a fresh 60 seconds (configurable). The host runs `setTimeout` and is authoritative; the guest shows a local `requestAnimationFrame` countdown, reconciled on every state sync.

## Game Rules

- **Board**: 15×15 grid with bonus squares (DL, TL, DW, TW)
- **Tiles**: 100 tiles with balanced letter distribution
- **Hand Size**: 7 tiles
- **Starting Move**: First word must cover center square (7,7)
- **Valid Moves**: All placed tiles must form a single contiguous row or column, connected to existing tiles
- **Bonuses**: Letter/word multipliers apply only when first covered
- **All-Tiles Bonus**: 50 points for using all 7 tiles in one turn
- **Game End**: Game ends when bag is empty and a player uses their last tile, two consecutive passes, timer expires, or resignation

## Package Details

### @blitztiles/shared

Pure TypeScript library with zero dependencies. All exports from `packages/shared/src/index.ts`.

**Key Modules:**

- `types.ts` — All TypeScript types and interfaces
- `constants.ts` — Tile distribution, bonus square map, game defaults
- `tileBag.ts` — Tile bag operations with deterministic PRNG
- `words.ts` — Trie-based dictionary for O(k) word lookup
- `board.ts` — Board validation and word extraction
- `scoring.ts` — Score calculation with bonus multipliers
- `gameEngine.ts` — Pure state machine for all game actions

### @blitztiles/client

React single-page application.

**Key Components:**

- `HomePage` — Create or join games
- `GamePage` — Main gameplay interface

**Key Hooks:**

- `useGameStore.ts` — Zustand store for local and networked play
- `useGameConnection.ts` — PeerJS WebRTC connection manager with message buffering + REQUEST_SYNC
- `useTimer.ts` — Frame-accurate countdown using `requestAnimationFrame`

## Development Commands

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter shared test

# Start client dev server
pnpm dev

# Build all packages
pnpm build

# Type check all packages
pnpm typecheck
```

## Project Conventions

- **Small, focused files** — One module per concern
- **Pure functions in shared/** — No side effects, no I/O
- **Colocated tests** — `foo.ts` → `foo.test.ts` in same directory
- **Discriminated unions** — All message types tagged with `type` field
- **Board coordinates** — Row 0–14 (top→bottom), Col 0–14 (left→right), Center at (7,7)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Ensure tests pass (`pnpm test`)
5. Type check passes (`pnpm typecheck`)
6. Commit with clear messages (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Commit Strategy

- Many small commits, each self-contained and passing tests
- Commit messages describe what changed and why
- Each commit should leave the project in a buildable state

## License

MIT

## Acknowledgments

- Uses the [ENABLE word list](https://everything2.com/title/ENABLE) (public domain)
- Multiplayer powered by [PeerJS](https://peerjs.com/) (WebRTC)

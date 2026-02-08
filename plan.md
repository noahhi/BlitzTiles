Plan to implement │
│ │
│ BlitzTiles Implementation Plan │
│ │
│ Context │
│ │
│ BlitzTiles is a crossword-style word game with blitz-chess style move clocks, built as a mobile-friendly web app. Players can jump in without │
│ accounts, share a link to invite an opponent, and play with time pressure adding a strategic dimension beyond traditional word games. The │
│ project is greenfield — no code exists yet. │
│ │
│ --- │
│ Architecture Decisions │
│ │
│ Stack │
│ │
│ - Frontend: React + TypeScript + Vite │
│ - State management: Zustand (minimal boilerplate, ~1KB) │
│ - Drag-and-drop: @dnd-kit (first-class touch support, ~10KB) │
│ - Multiplayer server: PartyKit (Cloudflare Durable Objects) — each game room is a Durable Object with WebSocket connections. Handles room │
│ management, reconnection, and edge deployment with zero server provisioning. Free tier covers 100K requests/day. │
│ - Networking client: partysocket (auto-reconnection built in) │
│ - Routing: react-router-dom │
│ - Testing: Vitest │
│ - Dictionary: ENABLE word list (~172K words, public domain — safe for open source) │
│ │
│ Why PartyKit over alternatives │
│ │
│ - vs raw WebSocket server: No server to provision/pay for. No connection pooling. Rooms are first-class. │
│ - vs WebRTC: Eliminates NAT traversal complexity. Server-authoritative validation and timer sync are trivial (impossible with pure P2P). │
│ - vs Firebase/Supabase: Lower latency (raw WebSocket vs polling-based realtime). No heavy SDK. No database for ephemeral game state. │
│ │
│ Server-authoritative game state │
│ │
│ The server owns all game state: board, tile bag, hands, scores, and timers. Clients send intents (SUBMIT_MOVE, PASS, EXCHANGE), the server │
│ validates, updates state, and broadcasts. This prevents cheating and makes timer sync trivial. Clients do optimistic UI for tile placement │
│ (before submit) but never advance game state locally. │
│ │
│ Timer sync │
│ │
│ - Server records turnStartTimestamp on each turn │
│ - Server schedules a Durable Object alarm() for when time would expire │
│ - Clients display a locally-ticking countdown, reconciled on every server message and periodic TIMER_SYNC pings (every 5s) │
│ - Player disconnects don't pause the clock │
│ │
│ --- │
│ Project Structure │
│ │
│ blitztiles/ │
│ ├── package.json # pnpm workspace root │
│ ├── tsconfig.base.json │
│ ├── packages/ │
│ │ ├── shared/ # Shared types + pure game logic │
│ │ │ └── src/ │
│ │ │ ├── types.ts # GameState, Tile, PlayerState, messages │
│ │ │ ├── constants.ts # Tile distribution, board bonuses, defaults │
│ │ │ ├── board.ts # Placement validation, word extraction │
│ │ │ ├── scoring.ts # Score calculation with bonus squares │
│ │ │ ├── tileBag.ts # Tile bag: create, draw, exchange │
│ │ │ ├── words.ts # Trie implementation for word lookup │
│ │ │ └── gameEngine.ts # Pure state machine: submitMove, pass, exchange │
│ │ ├── client/ # React + Vite frontend │
│ │ │ └── src/ │
│ │ │ ├── pages/ │
│ │ │ │ ├── HomePage.tsx # Create/Join game │
│ │ │ │ └── GamePage.tsx # Main game view │
│ │ │ ├── components/ │
│ │ │ │ ├── board/ │
│ │ │ │ │ ├── GameBoard.tsx # 15x15 CSS Grid + DnD context │
│ │ │ │ │ └── BoardCell.tsx # Single cell (droppable) │
│ │ │ │ ├── tiles/ │
│ │ │ │ │ ├── TileRack.tsx # Player's 7-tile hand │
│ │ │ │ │ └── DraggableTile.tsx │
│ │ │ │ └── game/ │
│ │ │ │ ├── GameHeader.tsx # Scores + timers │
│ │ │ │ ├── TimerDisplay.tsx │
│ │ │ │ ├── GameControls.tsx │
│ │ │ │ ├── GameOverModal.tsx │
│ │ │ │ └── BlankTileModal.tsx │
│ │ │ ├── hooks/ │
│ │ │ │ ├── useGameStore.ts # Zustand store │
│ │ │ │ ├── useGameConnection.ts # PartySocket connection │
│ │ │ │ └── useTimer.ts # Client-side timer tick │
│ │ │ └── styles/ │
│ │ └── server/ # PartyKit server │
│ │ ├── src/ │
│ │ │ ├── game.ts # Main PartyKit server class │
│ │ │ ├── timerManager.ts # Timer tracking + alarm scheduling │
│ │ │ └── dictionary.ts # Dictionary loading + Trie │
│ │ └── data/ │
│ │ └── enable.txt # ENABLE word list │
│ │
│ --- │
│ Phased Implementation │
│ │
│ Phase 1: Foundation + Shared Core (sequential) │
│ │
│ Scaffold the project, define the shared contract, and implement all core game logic. This phase must complete first because both client and │
│ server depend on it. │
│ │
│ Scaffolding: │
│ - Initialize pnpm workspace with shared, client, server packages │
│ - Scaffold React app with Vite (client/) │
│ - Scaffold PartyKit server (server/) │
│ - tsconfig.base.json with shared TypeScript config │
│ │
│ Shared types (shared/src/types.ts): │
│ - All TypeScript types: Tile, PlacedTile, GameState, PlayerState │
│ - ClientMessage / ServerMessage discriminated unions (the network contract) │
│ - GameConfig (timer mode, duration, dictionary choice) │
│ │
│ Shared constants (shared/src/constants.ts): │
│ - Tile distribution (100 tiles, letters/counts/values) │
│ - 15x15 bonus square map (DL/TL/DW/TW) │
│ - Game config defaults │
│ │
│ Shared game logic (pure functions, fully tested): │
│ - shared/src/tileBag.ts — createTileBag(), drawTiles(), exchangeTiles() │
│ - shared/src/words.ts — Trie class with insert() and has(), loadDictionary() parser │
│ - shared/src/board.ts — isValidPlacement(), getFormedWords() │
│ - shared/src/scoring.ts — scoreTurn() with DL/TL/DW/TW bonuses, 50-point all-tiles bonus │
│ - shared/src/gameEngine.ts — pure state machine: createGame(), submitMove(), passTurn(), exchangeTiles(), checkEndConditions() │
│ - Unit tests for all of the above │
│ │
│ --- │
│ Phase 2: Client + Server in Parallel (via subagents) │
│ │
│ Once Phase 1 is complete, client and server can be built simultaneously since they both depend only on the shared package. │
│ │
│ Phase 2A: Client (subagent A) │
│ │
│ Build the full client UI with local hot-seat play, then wire up networking. │
│ │
│ Board + Tiles (static rendering): │
│ - GameBoard.tsx + BoardCell.tsx — 15x15 CSS Grid with bonus square colors │
│ - DraggableTile.tsx + TileRack.tsx — tile visuals (letter + point value), 7-tile rack │
│ - Responsive layout: board fills width on mobile, side-by-side on desktop │
│ │
│ Drag-and-drop + mobile input: │
│ - @dnd-kit integration: DndContext in board, useDraggable on tiles, useDroppable on cells │
│ - Drag overlay follows pointer/finger (CSS transforms, GPU-accelerated) │
│ - Tap-to-place as primary mobile input: tap tile (highlights) → tap cell (places) │
│ - Pinch-to-zoom wrapper on the board │
│ - Visual feedback: cell highlight on drag-over, snap animation, tile lift effect │
│ │
│ Local hot-seat play: │
│ - useGameStore.ts — Zustand store driving local play via shared gameEngine │
│ - GamePage.tsx — hot-seat mode: hands swap on turn change │
│ - GameControls.tsx — Submit, Pass, Exchange, Shuffle buttons │
│ - GameHeader.tsx + ScoreDisplay.tsx — player names and scores │
│ │
│ Timer display: │
│ - TimerDisplay.tsx — both clocks, active clock pulses, color shifts white→yellow→red │
│ - useTimer.ts — requestAnimationFrame countdown, MM:SS format (SS.T under 10s) │
│ │
│ Networking hookup (after server is ready): │
│ - useGameConnection.ts — PartySocket hook: connect to room, translate server messages to Zustand updates │
│ - HomePage.tsx — create game (pick timer mode + duration), join game (enter code or paste link) │
│ │
│ Modals + polish: │
│ - GameOverModal.tsx — final scores, rematch button │
│ - BlankTileModal.tsx — letter picker for blank tiles │
│ - Exchange tiles modal │
│ │
│ Phase 2B: Server (subagent B) │
│ │
│ Build the PartyKit server that wraps shared game logic with networking, auth, and timers. │
│ │
│ Core server: │
│ - server/src/game.ts — PartyKit server class: │
│ - onConnect: assign player index (0 or 1), send waiting state or start game when 2 connected │
│ - onMessage: parse ClientMessage, validate via shared gameEngine, broadcast ServerMessage │
│ - onClose: mark disconnected (timer keeps running) │
│ - alarm(): handle timer expiry │
│ - Security: filter GameState before sending — each player only gets their own hand tiles, opponent hand sent as count only │
│ │
│ Dictionary: │
│ - server/src/dictionary.ts — load ENABLE word list into Trie on Durable Object startup, cache in memory │
│ │
│ Timer manager: │
│ - server/src/timerManager.ts — record turn start, compute elapsed on move, schedule DO alarms │
│ - Sudden Death: alarm fires → game over, timed-out player loses │
│ - Time Penalty: track cumulative time, compute point deductions at game end │
│ - Periodic TIMER_SYNC messages every 5s during active play │
│ │
│ Room management: │
│ - Generate 4-char room codes │
│ - Handle reconnection (match player by ID in WebSocket URL query param) │
│ - Rematch flow: same room, swap turn order │
│ │
│ --- │
│ Phase 3: Integration + Polish (sequential) │
│ │
│ Converge the two workstreams and add final polish. │
│ │
│ - Wire useGameConnection.ts to server (swap local engine for network messages) │
│ - End-to-end testing: two browser tabs, create game → join → play → game over → rematch │
│ - Animations: tile snap (scale bounce), score popup (floating "+42"), word highlight │
│ - Sound effects via Web Audio API (tile place, word accepted/rejected, timer warnings) │
│ - Move history panel (collapsible) │
│ - Connection status indicator │
│ - Dark mode default, clean modern aesthetic │
│ │
│ Phase 4: Testing + Deployment │
│ │
│ - Comprehensive unit tests for shared/ (board edge cases, scoring combos, full game simulations) │
│ - Component tests with React Testing Library │
│ - Server integration tests (simulated 2-client game flows) │
│ - Deploy client to Cloudflare Pages │
│ - Deploy server via PartyKit CLI / wrangler │
│ - GitHub Actions CI: lint, typecheck, test, build, deploy │
│ │
│ --- │
│ Key Game Rules Reference │
│ │
│ - Board: 15x15 grid with standard bonus square layout (symmetric) │
│ - Tiles: 100 total (balanced letter distribution), 2 blanks (0 points, represent any letter) │
│ - Hand size: 7 tiles │
│ - First move: must cover the center square │
│ - Placement rules: tiles must form a single row or column, be contiguous (gaps filled by existing tiles), connect to at least one existing │
│ tile │
│ - Scoring: letter values × letter bonuses + word bonuses. Bonuses apply only on the turn placed. 50-point bonus for using all 7 tiles. │
│ - End conditions: (a) player uses last tile + bag empty (bonus = sum of opponent's hand), (b) both players pass consecutively, (c) timer │
│ expires (mode-dependent), (d) resignation │
│ │
│ Verification │
│ │
│ After each phase, verify by: │
│ 1. Phase 1: Run pnpm test — all shared game logic unit tests pass. Game engine can simulate a full game programmatically. │
│ 2. Phase 2A: Board renders 225 cells with correct bonus colors on mobile and desktop. Tiles can be placed via drag-and-drop (desktop) and │
│ tap-to-place (mobile). Local hot-seat game plays to completion with correct scoring. │
│ 3. Phase 2B: Server starts, accepts two WebSocket connections, validates moves, broadcasts state. Timer alarms fire correctly. Can be tested │
│ with a simple WebSocket client script. │
│ 4. Phase 3: Open two browser tabs, create a game in one, join via code in the other, play a full networked game to completion. Timers work. │
│ Rematch works. Animations and sounds play. │
│ 5. Phase 4: CI passes, deployed and playable at a public URL.

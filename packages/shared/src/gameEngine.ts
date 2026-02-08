/**
 * Pure game state machine for BlitzTiles.
 *
 * Every function takes the current state (+ action params) and returns a new
 * state. No mutation, no side effects, no I/O.
 *
 * Used by the server for authoritative validation and by the client for
 * local hot-seat mode.
 */

import type {
  Board,
  GameConfig,
  GameState,
  MoveRecord,
  PlacedTile,
  PlayerState,
  Tile,
} from './types.js';
import { DEFAULT_GAME_CONFIG, HAND_SIZE } from './constants.js';
import { createEmptyBoard, getFormedWords, isValidPlacement } from './board.js';
import { scoreTurn, getEndGameBonus } from './scoring.js';
import { createTileBag, drawTiles, exchangeTiles as bagExchangeTiles } from './tileBag.js';
import type { Trie } from './words.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface MoveResult {
  success: true;
  state: GameState;
  formedWords: string[];
  score: number;
}

export interface MoveError {
  success: false;
  reason: string;
}

export type SubmitMoveResult = MoveResult | MoveError;

export interface PassResult {
  state: GameState;
  gameOver: boolean;
}

export interface ExchangeResult {
  success: true;
  state: GameState;
}

export interface ExchangeError {
  success: false;
  reason: string;
}

export type ExchangeTilesResult = ExchangeResult | ExchangeError;

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

/**
 * Creates an initial game state with two players.
 *
 * Draws 7 tiles for each player from a freshly created tile bag.
 * The game starts in 'playing' phase with player 0's turn.
 */
export function createGame(
  roomId: string,
  player0Id: string,
  player1Id: string,
  config: GameConfig = DEFAULT_GAME_CONFIG,
  seed?: number,
): GameState {
  const { tiles: bag } = createTileBag(seed);

  // Draw hands for both players
  const draw0 = drawTiles(bag, HAND_SIZE);
  const draw1 = drawTiles(draw0.remaining, HAND_SIZE);

  const players: [PlayerState, PlayerState] = [
    {
      id: player0Id,
      name: 'Player 1',
      hand: draw0.drawn,
      score: 0,
      timeRemainingMs: config.timerMode === 'untimed' ? Infinity : config.timerDurationMs,
      connected: true,
    },
    {
      id: player1Id,
      name: 'Player 2',
      hand: draw1.drawn,
      score: 0,
      timeRemainingMs: config.timerMode === 'untimed' ? Infinity : config.timerDurationMs,
      connected: true,
    },
  ];

  return {
    roomId,
    phase: 'playing',
    config,
    board: createEmptyBoard(),
    players,
    currentPlayerIndex: 0,
    tileBag: draw1.remaining,
    consecutivePasses: 0,
    turnStartTimestamp: new Date().toISOString(),
    winnerIndex: null,
    endReason: null,
    moveHistory: [],
    stateVersion: 1,
    lastMoveTiles: [],
    sharedRack: null,
    racingRound: null,
    consecutiveSkippedRounds: 0,
    roundStartTimestamp: null,
  };
}

// ---------------------------------------------------------------------------
// placeTilesOnBoard (internal helper)
// ---------------------------------------------------------------------------

/** Returns a new board with the given tiles placed on it. */
function placeTilesOnBoard(board: Board, tiles: PlacedTile[]): Board {
  const newBoard: Board = board.map((row) =>
    row.map((cell) => ({ ...cell, tile: cell.tile ? { ...cell.tile } : null })),
  );
  for (const tile of tiles) {
    newBoard[tile.row][tile.col] = {
      ...newBoard[tile.row][tile.col],
      tile: { ...tile },
    };
  }
  return newBoard;
}

// ---------------------------------------------------------------------------
// submitMove
// ---------------------------------------------------------------------------

/**
 * Validates and applies a tile placement move.
 *
 * Steps:
 * 1. Check it's the player's turn.
 * 2. Check the player has the tiles they're placing.
 * 3. Validate placement on the board.
 * 4. Extract formed words and validate all against the dictionary.
 * 5. Calculate score.
 * 6. Update board, hand, bag, scores, and advance turn.
 * 7. Check end conditions.
 */
export function submitMove(
  state: GameState,
  playerIndex: number,
  tiles: PlacedTile[],
  dictionary: Trie,
): SubmitMoveResult {
  // Must be playing
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Game is not in progress' };
  }

  // Must be this player's turn
  if (state.currentPlayerIndex !== playerIndex) {
    return { success: false, reason: 'Not your turn' };
  }

  const player = state.players[playerIndex];

  // Verify the player actually has these tiles in their hand
  const handIds = new Set(player.hand.map((t) => t.id));
  for (const t of tiles) {
    if (!handIds.has(t.id)) {
      return { success: false, reason: `Tile ${t.id} is not in your hand` };
    }
  }

  // Validate placement on the board
  const placement = isValidPlacement(state.board, tiles);
  if (!placement.valid) {
    return { success: false, reason: placement.reason! };
  }

  // Extract formed words
  const { words: formedWords } = getFormedWords(state.board, tiles);
  if (formedWords.length === 0) {
    return { success: false, reason: 'No words formed' };
  }

  // Validate all words against the dictionary
  for (const { word } of formedWords) {
    if (!dictionary.has(word)) {
      return { success: false, reason: `"${word}" is not a valid word` };
    }
  }

  // Calculate score
  const score = scoreTurn(state.board, tiles, formedWords);

  // Update board
  const newBoard = placeTilesOnBoard(state.board, tiles);

  // Remove placed tiles from hand, draw replacements
  const placedIds = new Set(tiles.map((t) => t.id));
  const remainingHand = player.hand.filter((t) => !placedIds.has(t.id));
  const tilesToDraw = HAND_SIZE - remainingHand.length;
  const { drawn, remaining: newBag } = drawTiles(state.tileBag, tilesToDraw);
  const newHand = [...remainingHand, ...drawn];

  // Build move record
  const moveRecord: MoveRecord = {
    playerIndex,
    action: 'submit',
    words: formedWords.map((w) => w.word),
    score,
    timestamp: new Date().toISOString(),
  };

  // Build updated player states
  const newPlayers: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  newPlayers[playerIndex] = {
    ...newPlayers[playerIndex],
    hand: newHand,
    score: newPlayers[playerIndex].score + score,
  };

  // New state before checking end conditions
  let newState: GameState = {
    ...state,
    board: newBoard,
    players: newPlayers,
    currentPlayerIndex: playerIndex === 0 ? 1 : 0,
    tileBag: newBag,
    consecutivePasses: 0,
    turnStartTimestamp: new Date().toISOString(),
    moveHistory: [...state.moveHistory, moveRecord],
    stateVersion: state.stateVersion + 1,
    lastMoveTiles: tiles.map((t) => ({ row: t.row, col: t.col })),
  };

  // Check end conditions
  newState = checkEndConditions(newState);

  return {
    success: true,
    state: newState,
    formedWords: formedWords.map((w) => w.word),
    score,
  };
}

// ---------------------------------------------------------------------------
// passTurn
// ---------------------------------------------------------------------------

/**
 * Current player passes their turn.
 *
 * If both players pass consecutively, the game ends.
 */
export function passTurn(state: GameState, playerIndex: number): PassResult {
  if (state.phase !== 'playing') {
    return { state, gameOver: false };
  }

  if (state.currentPlayerIndex !== playerIndex) {
    return { state, gameOver: false };
  }

  const moveRecord: MoveRecord = {
    playerIndex,
    action: 'pass',
    words: [],
    score: 0,
    timestamp: new Date().toISOString(),
  };

  let newState: GameState = {
    ...state,
    currentPlayerIndex: playerIndex === 0 ? 1 : 0,
    consecutivePasses: state.consecutivePasses + 1,
    turnStartTimestamp: new Date().toISOString(),
    moveHistory: [...state.moveHistory, moveRecord],
    stateVersion: state.stateVersion + 1,
    lastMoveTiles: [],
  };

  newState = checkEndConditions(newState);

  return {
    state: newState,
    gameOver: newState.phase === 'finished',
  };
}

// ---------------------------------------------------------------------------
// exchangeTiles
// ---------------------------------------------------------------------------

/**
 * Current player exchanges tiles from their hand.
 *
 * The player selects tiles to return to the bag and draws the same number
 * of new tiles. At least 1 tile must be exchanged, and there must be
 * enough tiles in the bag.
 */
export function exchangeTiles(
  state: GameState,
  playerIndex: number,
  tileIds: string[],
): ExchangeTilesResult {
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Game is not in progress' };
  }

  if (state.currentPlayerIndex !== playerIndex) {
    return { success: false, reason: 'Not your turn' };
  }

  if (tileIds.length === 0) {
    return { success: false, reason: 'Must exchange at least one tile' };
  }

  const player = state.players[playerIndex];
  const handMap = new Map(player.hand.map((t) => [t.id, t]));

  // Verify the player has all the tiles they want to exchange
  const tilesToReturn: Tile[] = [];
  for (const id of tileIds) {
    const tile = handMap.get(id);
    if (!tile) {
      return { success: false, reason: `Tile ${id} is not in your hand` };
    }
    tilesToReturn.push(tile);
  }

  // Must have enough tiles in the bag
  if (state.tileBag.length < tileIds.length) {
    return { success: false, reason: 'Not enough tiles in the bag to exchange' };
  }

  const result = bagExchangeTiles(state.tileBag, tilesToReturn, tileIds.length);
  if (!result) {
    return { success: false, reason: 'Exchange failed' };
  }

  // Build new hand
  const returnedIds = new Set(tileIds);
  const keptTiles = player.hand.filter((t) => !returnedIds.has(t.id));
  const newHand = [...keptTiles, ...result.drawn];

  const moveRecord: MoveRecord = {
    playerIndex,
    action: 'exchange',
    words: [],
    score: 0,
    timestamp: new Date().toISOString(),
  };

  const newPlayers: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  newPlayers[playerIndex] = {
    ...newPlayers[playerIndex],
    hand: newHand,
  };

  const newState: GameState = {
    ...state,
    players: newPlayers,
    currentPlayerIndex: playerIndex === 0 ? 1 : 0,
    tileBag: result.newBag,
    consecutivePasses: 0,
    turnStartTimestamp: new Date().toISOString(),
    moveHistory: [...state.moveHistory, moveRecord],
    stateVersion: state.stateVersion + 1,
    lastMoveTiles: [],
  };

  return { success: true, state: newState };
}

// ---------------------------------------------------------------------------
// resignGame
// ---------------------------------------------------------------------------

/**
 * A player resigns. The other player wins immediately.
 */
export function resignGame(state: GameState, playerIndex: number): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  return {
    ...state,
    phase: 'finished',
    winnerIndex: playerIndex === 0 ? 1 : 0,
    endReason: `Player ${playerIndex + 1} resigned`,
    stateVersion: state.stateVersion + 1,
  };
}

// ---------------------------------------------------------------------------
// Per-turn timeout
// ---------------------------------------------------------------------------

/**
 * Handle per-turn timeout: auto-passes the current player.
 * Delegates to passTurn, so two consecutive timeouts end the game.
 */
export function handleTurnTimeout(state: GameState): PassResult {
  if (state.phase !== 'playing') {
    return { state, gameOver: false };
  }
  return passTurn(state, state.currentPlayerIndex);
}

// ---------------------------------------------------------------------------
// Timer expiry
// ---------------------------------------------------------------------------

/**
 * Handle timer expiry for a player.
 * In sudden_death mode, the player who ran out of time loses.
 */
export function handleTimerExpiry(state: GameState, playerIndex: number): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  if (state.config.timerMode === 'sudden_death') {
    return {
      ...state,
      phase: 'finished',
      winnerIndex: playerIndex === 0 ? 1 : 0,
      endReason: `Player ${playerIndex + 1} ran out of time`,
      players: [
        {
          ...state.players[0],
          timeRemainingMs: playerIndex === 0 ? 0 : state.players[0].timeRemainingMs,
        },
        {
          ...state.players[1],
          timeRemainingMs: playerIndex === 1 ? 0 : state.players[1].timeRemainingMs,
        },
      ] as [PlayerState, PlayerState],
      stateVersion: state.stateVersion + 1,
    };
  }

  // For time_penalty mode, the game continues but penalties apply at the end
  return state;
}

// ---------------------------------------------------------------------------
// updatePlayerTime
// ---------------------------------------------------------------------------

/**
 * Updates a player's remaining time. Called by the server on each turn
 * transition to deduct elapsed time.
 */
export function updatePlayerTime(
  state: GameState,
  playerIndex: number,
  elapsedMs: number,
): GameState {
  const newPlayers: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];

  newPlayers[playerIndex] = {
    ...newPlayers[playerIndex],
    timeRemainingMs: Math.max(0, newPlayers[playerIndex].timeRemainingMs - elapsedMs),
  };

  return {
    ...state,
    players: newPlayers,
  };
}

// ---------------------------------------------------------------------------
// checkEndConditions (internal)
// ---------------------------------------------------------------------------

/**
 * Checks if the game has ended and updates state accordingly.
 *
 * End conditions:
 * 1. A player empties their hand and the bag is empty → that player wins
 *    (they get bonus points equal to sum of opponent's remaining tiles).
 * 2. Two consecutive passes → game over, highest score wins.
 */
export function checkEndConditions(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  // Condition 1: Player emptied their hand and bag is empty
  for (let i = 0; i < 2; i++) {
    if (state.players[i].hand.length === 0 && state.tileBag.length === 0) {
      const opponentIndex = i === 0 ? 1 : 0;
      const bonus = getEndGameBonus(state.players[opponentIndex].hand.map((t) => t.value));

      const newPlayers: [PlayerState, PlayerState] = [
        { ...state.players[0] },
        { ...state.players[1] },
      ];
      // Winner gets bonus, opponent loses the value of their tiles
      newPlayers[i] = {
        ...newPlayers[i],
        score: newPlayers[i].score + bonus,
      };
      newPlayers[opponentIndex] = {
        ...newPlayers[opponentIndex],
        score: newPlayers[opponentIndex].score - bonus,
      };

      const winnerIndex = newPlayers[0].score >= newPlayers[1].score ? 0 : 1;

      return {
        ...state,
        players: newPlayers,
        phase: 'finished',
        winnerIndex,
        endReason: `Player ${i + 1} played all tiles`,
        stateVersion: state.stateVersion + 1,
      };
    }
  }

  // Condition 2: Two consecutive passes
  if (state.consecutivePasses >= 2) {
    // Both players lose points for tiles remaining in their hands
    const newPlayers: [PlayerState, PlayerState] = [
      { ...state.players[0] },
      { ...state.players[1] },
    ];
    for (let i = 0; i < 2; i++) {
      const handValue = newPlayers[i].hand.reduce((sum, t) => sum + t.value, 0);
      newPlayers[i] = {
        ...newPlayers[i],
        score: newPlayers[i].score - handValue,
      };
    }

    let winnerIndex: number | null;
    if (newPlayers[0].score > newPlayers[1].score) {
      winnerIndex = 0;
    } else if (newPlayers[1].score > newPlayers[0].score) {
      winnerIndex = 1;
    } else {
      winnerIndex = null; // draw
    }

    return {
      ...state,
      players: newPlayers,
      phase: 'finished',
      winnerIndex,
      endReason: 'Both players passed consecutively',
      stateVersion: state.stateVersion + 1,
    };
  }

  return state;
}

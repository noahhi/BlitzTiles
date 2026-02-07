/**
 * Racing mode game engine for BlitzTiles.
 *
 * Both players see the same shared rack and race to place a valid word first.
 * No turns — simultaneous play. First valid submission wins the round.
 *
 * Reuses board.ts, scoring.ts, tileBag.ts, and words.ts from the shared package.
 * All functions are pure — no mutation, no side effects, no I/O.
 */

import type { Board, GameConfig, GameState, MoveRecord, PlacedTile, PlayerState } from './types.js';
import { DEFAULT_GAME_CONFIG, HAND_SIZE } from './constants.js';
import { createEmptyBoard, getFormedWords, isValidPlacement } from './board.js';
import { scoreTurn } from './scoring.js';
import { createTileBag, drawTiles } from './tileBag.js';
import type { Trie } from './words.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface RacingMoveResult {
  success: true;
  state: GameState;
  formedWords: string[];
  score: number;
}

export interface RacingMoveError {
  success: false;
  reason: string;
}

export type SubmitRacingMoveResult = RacingMoveResult | RacingMoveError;

export interface RacingTimeoutResult {
  state: GameState;
  gameOver: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
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
// createRacingGame
// ---------------------------------------------------------------------------

/**
 * Creates an initial racing game state with two players.
 *
 * Draws 7 tiles to the shared rack (both players see the same tiles).
 * Player hands are empty — the shared rack is the source.
 */
export function createRacingGame(
  roomId: string,
  player0Id: string,
  player1Id: string,
  config: GameConfig = DEFAULT_GAME_CONFIG,
  seed?: number,
): GameState {
  const { tiles: bag } = createTileBag(seed);

  // Draw shared rack
  const draw = drawTiles(bag, HAND_SIZE);

  const players: [PlayerState, PlayerState] = [
    {
      id: player0Id,
      name: 'Player 1',
      hand: [], // empty — racing uses sharedRack
      score: 0,
      timeRemainingMs: Infinity,
      connected: true,
    },
    {
      id: player1Id,
      name: 'Player 2',
      hand: [], // empty — racing uses sharedRack
      score: 0,
      timeRemainingMs: Infinity,
      connected: true,
    },
  ];

  const now = new Date().toISOString();

  return {
    roomId,
    phase: 'playing',
    config,
    board: createEmptyBoard(),
    players,
    currentPlayerIndex: 0, // not meaningful in racing — both play simultaneously
    tileBag: draw.remaining,
    consecutivePasses: 0,
    turnStartTimestamp: now,
    winnerIndex: null,
    endReason: null,
    moveHistory: [],
    stateVersion: 1,
    lastMoveTiles: [],
    sharedRack: draw.drawn,
    racingRound: 1,
    consecutiveSkippedRounds: 0,
    roundStartTimestamp: now,
  };
}

// ---------------------------------------------------------------------------
// submitRacingMove
// ---------------------------------------------------------------------------

/**
 * Validates and applies a racing move submission.
 *
 * The submitting player must use tiles from the shared rack.
 * On success: tiles go on board, used tiles removed from shared rack,
 * rack refills to 7, next round starts.
 */
export function submitRacingMove(
  state: GameState,
  playerIndex: number,
  tiles: PlacedTile[],
  dictionary: Trie,
): SubmitRacingMoveResult {
  if (state.phase !== 'playing') {
    return { success: false, reason: 'Game is not in progress' };
  }

  if (!state.sharedRack) {
    return { success: false, reason: 'Not a racing game' };
  }

  if (tiles.length === 0) {
    return { success: false, reason: 'No tiles placed' };
  }

  // Verify tiles come from the shared rack
  const rackIds = new Set(state.sharedRack.map((t) => t.id));
  for (const t of tiles) {
    if (!rackIds.has(t.id)) {
      return { success: false, reason: `Tile ${t.id} is not in the shared rack` };
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

  // Remove used tiles from shared rack, draw replacements
  const usedIds = new Set(tiles.map((t) => t.id));
  const remainingRack = state.sharedRack.filter((t) => !usedIds.has(t.id));
  const tilesToDraw = HAND_SIZE - remainingRack.length;
  const { drawn, remaining: newBag } = drawTiles(state.tileBag, tilesToDraw);
  const newRack = [...remainingRack, ...drawn];

  // Build move record
  const moveRecord: MoveRecord = {
    playerIndex,
    action: 'submit',
    words: formedWords.map((w) => w.word),
    score,
    timestamp: new Date().toISOString(),
  };

  // Update player score
  const newPlayers: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  newPlayers[playerIndex] = {
    ...newPlayers[playerIndex],
    score: newPlayers[playerIndex].score + score,
  };

  const now = new Date().toISOString();

  let newState: GameState = {
    ...state,
    board: newBoard,
    players: newPlayers,
    tileBag: newBag,
    consecutivePasses: 0,
    turnStartTimestamp: now,
    moveHistory: [...state.moveHistory, moveRecord],
    stateVersion: state.stateVersion + 1,
    lastMoveTiles: tiles.map((t) => ({ row: t.row, col: t.col })),
    sharedRack: newRack,
    racingRound: (state.racingRound ?? 0) + 1,
    consecutiveSkippedRounds: 0,
    roundStartTimestamp: now,
  };

  // Check end conditions
  newState = checkRacingEndConditions(newState);

  return {
    success: true,
    state: newState,
    formedWords: formedWords.map((w) => w.word),
    score,
  };
}

// ---------------------------------------------------------------------------
// handleRacingRoundTimeout
// ---------------------------------------------------------------------------

/**
 * Handle racing round timeout: neither player submitted in time.
 *
 * Increments consecutiveSkippedRounds. If 2 consecutive skips, game over.
 * Otherwise, discards current rack and draws a fresh 7.
 */
export function handleRacingRoundTimeout(state: GameState): RacingTimeoutResult {
  if (state.phase !== 'playing') {
    return { state, gameOver: false };
  }

  const newSkips = state.consecutiveSkippedRounds + 1;

  // 2 consecutive skipped rounds → game over
  if (newSkips >= 2) {
    const newState = finishRacingGame(state, 'Two consecutive rounds skipped');
    return {
      state: {
        ...newState,
        consecutiveSkippedRounds: newSkips,
        stateVersion: state.stateVersion + 1,
      },
      gameOver: true,
    };
  }

  // Draw fresh rack (discard current rack tiles — they go back into nothing)
  const { drawn, remaining: newBag } = drawTiles(state.tileBag, HAND_SIZE);
  const now = new Date().toISOString();

  let newState: GameState = {
    ...state,
    tileBag: newBag,
    sharedRack: drawn,
    racingRound: (state.racingRound ?? 0) + 1,
    consecutiveSkippedRounds: newSkips,
    roundStartTimestamp: now,
    turnStartTimestamp: now,
    stateVersion: state.stateVersion + 1,
    lastMoveTiles: [],
  };

  // If we couldn't draw any tiles, the game is over
  newState = checkRacingEndConditions(newState);

  return {
    state: newState,
    gameOver: newState.phase === 'finished',
  };
}

// ---------------------------------------------------------------------------
// checkRacingEndConditions
// ---------------------------------------------------------------------------

/**
 * Checks if a racing game has ended.
 *
 * End condition: bag is empty AND shared rack is empty (all tiles used).
 * Highest score wins.
 */
export function checkRacingEndConditions(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const rackEmpty = !state.sharedRack || state.sharedRack.length === 0;
  const bagEmpty = state.tileBag.length === 0;

  if (rackEmpty && bagEmpty) {
    return finishRacingGame(state, 'All tiles used');
  }

  return state;
}

// ---------------------------------------------------------------------------
// Internal: finishRacingGame
// ---------------------------------------------------------------------------

function finishRacingGame(state: GameState, reason: string): GameState {
  let winnerIndex: number | null;
  if (state.players[0].score > state.players[1].score) {
    winnerIndex = 0;
  } else if (state.players[1].score > state.players[0].score) {
    winnerIndex = 1;
  } else {
    winnerIndex = null; // draw
  }

  return {
    ...state,
    phase: 'finished',
    winnerIndex,
    endReason: reason,
    stateVersion: state.stateVersion + 1,
  };
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame,
  submitMove,
  passTurn,
  exchangeTiles,
  resignGame,
  handleTurnTimeout,
  handleTimerExpiry,
  updatePlayerTime,
  checkEndConditions,
} from './gameEngine.js';
import type { GameState, PlacedTile } from './types.js';
import { Trie } from './words.js';
import { HAND_SIZE } from './constants.js';

// ---------------------------------------------------------------------------
// Test dictionary — small set of known words
// ---------------------------------------------------------------------------

function createTestDictionary(): Trie {
  const trie = new Trie();
  const words = [
    'CAT',
    'CAR',
    'CARD',
    'CARE',
    'CART',
    'AT',
    'TO',
    'TON',
    'TAN',
    'DOG',
    'DO',
    'GO',
    'GOD',
    'DON',
    'NOD',
    'TAR',
    'RAT',
    'ART',
    'STAR',
    'RATS',
    'ARTS',
    'TARS',
    'HI',
    'HIT',
    'IT',
    'THE',
    'HE',
    'SHE',
    'HER',
    'HERE',
    'THERE',
    'AN',
    'AND',
    'HAND',
    'BAND',
    'LAND',
    'SAND',
    'STAND',
    'ON',
    'ONE',
    'TONE',
    'DONE',
    'BONE',
    'CONE',
    'ZONE',
    'OH',
    'OR',
    'ORE',
    'MORE',
    'CORE',
    'BORE',
    'SORE',
    'TORE',
    'WORE',
    'WORD',
    'WORDS',
    'SWORD',
    'AB',
    'BA',
    'AD',
    'DA',
    'AH',
    'HA',
    'AM',
    'MA',
    'AS',
    'IF',
    'IN',
    'IS',
    'NO',
    'OF',
    'SO',
    'UP',
    'WE',
    'BE',
    'BY',
    'ME',
    'MY',
    'OX',
    'PI',
    'RE',
    'US',
  ];
  for (const w of words) {
    trie.insert(w);
  }
  return trie;
}

// Deterministic seed for reproducible tests
const TEST_SEED = 42;

describe('createGame', () => {
  it('creates a game with two players in playing phase', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);

    expect(state.roomId).toBe('room-1');
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(2);
    expect(state.players[0].id).toBe('p0');
    expect(state.players[1].id).toBe('p1');
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.consecutivePasses).toBe(0);
    expect(state.winnerIndex).toBeNull();
    expect(state.endReason).toBeNull();
    expect(state.moveHistory).toHaveLength(0);
    expect(state.stateVersion).toBe(1);
  });

  it('deals 7 tiles to each player', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);

    expect(state.players[0].hand).toHaveLength(HAND_SIZE);
    expect(state.players[1].hand).toHaveLength(HAND_SIZE);
  });

  it('remaining bag has 86 tiles (100 - 7 - 7)', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);
    expect(state.tileBag).toHaveLength(86);
  });

  it('all tile IDs are unique across hands and bag', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);
    const allIds = [
      ...state.players[0].hand.map((t) => t.id),
      ...state.players[1].hand.map((t) => t.id),
      ...state.tileBag.map((t) => t.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('same seed produces same game', () => {
    const state1 = createGame('room-1', 'p0', 'p1', undefined, 12345);
    const state2 = createGame('room-1', 'p0', 'p1', undefined, 12345);

    expect(state1.players[0].hand.map((t) => t.letter)).toEqual(
      state2.players[0].hand.map((t) => t.letter),
    );
    expect(state1.players[1].hand.map((t) => t.letter)).toEqual(
      state2.players[1].hand.map((t) => t.letter),
    );
  });

  it('applies untimed config correctly', () => {
    const state = createGame(
      'room-1',
      'p0',
      'p1',
      {
        timerMode: 'untimed',
        timerDurationMs: 0,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 0,
      },
      TEST_SEED,
    );

    expect(state.players[0].timeRemainingMs).toBe(Infinity);
    expect(state.players[1].timeRemainingMs).toBe(Infinity);
  });

  it('applies timed config correctly', () => {
    const state = createGame(
      'room-1',
      'p0',
      'p1',
      {
        timerMode: 'sudden_death',
        timerDurationMs: 10 * 60 * 1000,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 0,
      },
      TEST_SEED,
    );

    expect(state.players[0].timeRemainingMs).toBe(600000);
    expect(state.players[1].timeRemainingMs).toBe(600000);
  });
});

describe('submitMove', () => {
  let state: GameState;
  let dict: Trie;

  beforeEach(() => {
    state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);
    dict = createTestDictionary();
  });

  it('rejects move when game is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const tiles: PlacedTile[] = [];
    const result = submitMove(finishedState, 0, tiles, dict);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('Game is not in progress');
    }
  });

  it("rejects move when it is not the player's turn", () => {
    const tiles: PlacedTile[] = [];
    const result = submitMove(state, 1, tiles, dict);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('Not your turn');
    }
  });

  it('rejects move with tiles not in hand', () => {
    const fakeTile: PlacedTile = {
      id: 'fake-tile',
      letter: 'Z',
      value: 10,
      isBlank: false,
      row: 7,
      col: 7,
      designatedLetter: 'Z',
    };
    const result = submitMove(state, 0, [fakeTile], dict);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('not in your hand');
    }
  });

  it('rejects move that does not cover center on first move', () => {
    // Place a tile from hand at (0,0) instead of center
    const tile = state.players[0].hand[0];
    const placed: PlacedTile = {
      ...tile,
      row: 0,
      col: 0,
      designatedLetter: tile.letter || 'A',
    };
    const result = submitMove(state, 0, [placed], dict);
    expect(result.success).toBe(false);
  });
});

describe('passTurn', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);
  });

  it('switches to other player', () => {
    const result = passTurn(state, 0);
    expect(result.state.currentPlayerIndex).toBe(1);
  });

  it('increments consecutive passes', () => {
    const result = passTurn(state, 0);
    expect(result.state.consecutivePasses).toBe(1);
  });

  it('records pass in move history', () => {
    const result = passTurn(state, 0);
    expect(result.state.moveHistory).toHaveLength(1);
    expect(result.state.moveHistory[0].action).toBe('pass');
    expect(result.state.moveHistory[0].playerIndex).toBe(0);
  });

  it('ends game after two consecutive passes', () => {
    const pass1 = passTurn(state, 0);
    const pass2 = passTurn(pass1.state, 1);
    expect(pass2.state.phase).toBe('finished');
    expect(pass2.state.endReason).toBe('Both players passed consecutively');
    expect(pass2.gameOver).toBe(true);
  });

  it('does nothing if game is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = passTurn(finishedState, 0);
    expect(result.state).toBe(finishedState);
    expect(result.gameOver).toBe(false);
  });

  it('does nothing if wrong player', () => {
    const result = passTurn(state, 1);
    expect(result.state).toBe(state);
  });

  it('increments state version', () => {
    const result = passTurn(state, 0);
    expect(result.state.stateVersion).toBe(state.stateVersion + 1);
  });
});

describe('exchangeTiles', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);
  });

  it('exchanges tiles successfully', () => {
    const tileIds = [state.players[0].hand[0].id, state.players[0].hand[1].id];
    const result = exchangeTiles(state, 0, tileIds);

    expect(result.success).toBe(true);
    if (result.success) {
      // Player still has 7 tiles
      expect(result.state.players[0].hand).toHaveLength(HAND_SIZE);
      // Old tiles are gone
      const newHandIds = new Set(result.state.players[0].hand.map((t) => t.id));
      expect(newHandIds.has(tileIds[0])).toBe(false);
      expect(newHandIds.has(tileIds[1])).toBe(false);
      // Turn switches
      expect(result.state.currentPlayerIndex).toBe(1);
      // Consecutive passes resets
      expect(result.state.consecutivePasses).toBe(0);
    }
  });

  it('rejects exchange when game is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = exchangeTiles(finishedState, 0, [state.players[0].hand[0].id]);
    expect(result.success).toBe(false);
  });

  it('rejects exchange when wrong player', () => {
    const result = exchangeTiles(state, 1, [state.players[1].hand[0].id]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('Not your turn');
    }
  });

  it('rejects exchange of zero tiles', () => {
    const result = exchangeTiles(state, 0, []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('Must exchange at least one tile');
    }
  });

  it('rejects exchange with tiles not in hand', () => {
    const result = exchangeTiles(state, 0, ['fake-tile-id']);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('not in your hand');
    }
  });

  it('rejects exchange when bag is too small', () => {
    // Empty the bag
    const emptyBagState = { ...state, tileBag: [] };
    const result = exchangeTiles(emptyBagState, 0, [state.players[0].hand[0].id]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('Not enough tiles');
    }
  });

  it('records exchange in move history', () => {
    const result = exchangeTiles(state, 0, [state.players[0].hand[0].id]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.moveHistory).toHaveLength(1);
      expect(result.state.moveHistory[0].action).toBe('exchange');
    }
  });
});

describe('resignGame', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);
  });

  it('player 0 resigns, player 1 wins', () => {
    const result = resignGame(state, 0);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBe(1);
    expect(result.endReason).toContain('resigned');
  });

  it('player 1 resigns, player 0 wins', () => {
    const result = resignGame(state, 1);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBe(0);
    expect(result.endReason).toContain('resigned');
  });

  it('does nothing if game is already finished', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = resignGame(finishedState, 0);
    expect(result).toBe(finishedState);
  });
});

describe('handleTimerExpiry', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame(
      'room-1',
      'p0',
      'p1',
      {
        timerMode: 'sudden_death',
        timerDurationMs: 600000,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 0,
      },
      TEST_SEED,
    );
  });

  it('sudden death: player 0 expires, player 1 wins', () => {
    const result = handleTimerExpiry(state, 0);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBe(1);
    expect(result.endReason).toContain('ran out of time');
    expect(result.players[0].timeRemainingMs).toBe(0);
  });

  it('sudden death: player 1 expires, player 0 wins', () => {
    const result = handleTimerExpiry(state, 1);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBe(0);
    expect(result.players[1].timeRemainingMs).toBe(0);
  });

  it('does nothing if game is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = handleTimerExpiry(finishedState, 0);
    expect(result).toBe(finishedState);
  });
});

describe('updatePlayerTime', () => {
  it('deducts elapsed time', () => {
    const state = createGame(
      'room-1',
      'p0',
      'p1',
      {
        timerMode: 'sudden_death',
        timerDurationMs: 600000,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 0,
      },
      TEST_SEED,
    );

    const result = updatePlayerTime(state, 0, 30000);
    expect(result.players[0].timeRemainingMs).toBe(570000);
    expect(result.players[1].timeRemainingMs).toBe(600000); // unchanged
  });

  it('does not go below zero', () => {
    const state = createGame(
      'room-1',
      'p0',
      'p1',
      {
        timerMode: 'sudden_death',
        timerDurationMs: 600000,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 0,
      },
      TEST_SEED,
    );

    const result = updatePlayerTime(state, 0, 999999);
    expect(result.players[0].timeRemainingMs).toBe(0);
  });
});

describe('checkEndConditions', () => {
  it('detects when a player empties their hand and bag is empty', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);

    // Simulate: player 0 has empty hand, bag is empty
    const modifiedState: GameState = {
      ...state,
      players: [
        { ...state.players[0], hand: [], score: 100 },
        { ...state.players[1], score: 50 },
      ],
      tileBag: [],
    };

    const result = checkEndConditions(modifiedState);
    expect(result.phase).toBe('finished');
    expect(result.endReason).toContain('played all tiles');
  });

  it('does not end game if bag still has tiles', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      players: [{ ...state.players[0], hand: [] }, { ...state.players[1] }],
      // tileBag still has tiles
    };

    const result = checkEndConditions(modifiedState);
    expect(result.phase).toBe('playing');
  });

  it('does not end game if player still has tiles in hand', () => {
    const state = createGame('room-1', 'p0', 'p1', undefined, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      tileBag: [],
      // player still has tiles in hand
    };

    const result = checkEndConditions(modifiedState);
    expect(result.phase).toBe('playing');
  });
});

describe('handleTurnTimeout (per-turn timer)', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame(
      'room-1',
      'p0',
      'p1',
      {
        timerMode: 'per_turn',
        timerDurationMs: 0,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 60000,
      },
      TEST_SEED,
    );
  });

  it('auto-passes the current player', () => {
    expect(state.currentPlayerIndex).toBe(0);
    const result = handleTurnTimeout(state);
    expect(result.state.currentPlayerIndex).toBe(1);
    expect(result.state.consecutivePasses).toBe(1);
    expect(result.gameOver).toBe(false);
  });

  it('two consecutive timeouts end the game', () => {
    const result1 = handleTurnTimeout(state);
    expect(result1.state.phase).toBe('playing');
    const result2 = handleTurnTimeout(result1.state);
    expect(result2.state.phase).toBe('finished');
    expect(result2.state.endReason).toBe('Both players passed consecutively');
    expect(result2.gameOver).toBe(true);
  });

  it('is a no-op when phase is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = handleTurnTimeout(finishedState);
    expect(result.state).toBe(finishedState);
    expect(result.gameOver).toBe(false);
  });

  it('records pass in move history', () => {
    const result = handleTurnTimeout(state);
    expect(result.state.moveHistory).toHaveLength(1);
    expect(result.state.moveHistory[0].action).toBe('pass');
    expect(result.state.moveHistory[0].playerIndex).toBe(0);
  });
});

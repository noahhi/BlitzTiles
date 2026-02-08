import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRacingGame,
  submitRacingMove,
  handleRacingRoundTimeout,
  checkRacingEndConditions,
} from './racingEngine.js';
import type { GameConfig, GameState, PlacedTile } from './types.js';
import { Trie } from './words.js';
import { HAND_SIZE } from './constants.js';

// ---------------------------------------------------------------------------
// Test dictionary
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
    'AN',
    'AND',
    'HAND',
    'ON',
    'ONE',
    'TONE',
    'OH',
    'OR',
    'ORE',
    'MORE',
    'CORE',
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

const TEST_SEED = 42;

const RACING_CONFIG: GameConfig = {
  timerMode: 'per_turn',
  timerDurationMs: 0,
  overtimePenaltyPerMinute: 0,
  turnTimeLimitMs: 0,
  gameVariant: 'racing',
  racingRoundTimeLimitMs: 30_000,
};

describe('createRacingGame', () => {
  it('creates a racing game with shared rack', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    expect(state.roomId).toBe('room-1');
    expect(state.phase).toBe('playing');
    expect(state.sharedRack).toHaveLength(HAND_SIZE);
    expect(state.racingRound).toBe(1);
    expect(state.consecutiveSkippedRounds).toBe(0);
    expect(state.roundStartTimestamp).not.toBeNull();
  });

  it('gives both players empty hands', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[1].hand).toHaveLength(0);
  });

  it('remaining bag has 93 tiles (100 - 7)', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);
    expect(state.tileBag).toHaveLength(93);
  });

  it('all tile IDs are unique across rack and bag', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);
    const allIds = [...state.sharedRack!.map((t) => t.id), ...state.tileBag.map((t) => t.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('same seed produces same game', () => {
    const state1 = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, 12345);
    const state2 = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, 12345);

    expect(state1.sharedRack!.map((t) => t.letter)).toEqual(
      state2.sharedRack!.map((t) => t.letter),
    );
  });
});

describe('submitRacingMove', () => {
  let state: GameState;
  let dict: Trie;

  beforeEach(() => {
    state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);
    dict = createTestDictionary();
  });

  it('rejects move when game is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = submitRacingMove(finishedState, 0, [], dict);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('Game is not in progress');
    }
  });

  it('rejects move with no tiles', () => {
    const result = submitRacingMove(state, 0, [], dict);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('No tiles placed');
    }
  });

  it('rejects move with tiles not in shared rack', () => {
    const fakeTile: PlacedTile = {
      id: 'fake-tile',
      letter: 'Z',
      value: 10,
      isBlank: false,
      row: 7,
      col: 7,
      designatedLetter: 'Z',
    };
    const result = submitRacingMove(state, 0, [fakeTile], dict);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('not in the shared rack');
    }
  });

  it('allows either player to submit (no turn restriction)', () => {
    // Both player 0 and player 1 should be able to submit
    // We just check neither gets a "not your turn" error
    const tile = state.sharedRack![0];
    const placed: PlacedTile = {
      ...tile,
      row: 7,
      col: 7,
      designatedLetter: tile.letter || 'A',
    };

    // Even if currentPlayerIndex is 0, player 1 should be able to submit
    const result = submitRacingMove(state, 1, [placed], dict);
    // May fail for invalid word or placement, but should NOT fail with "not your turn"
    if (!result.success) {
      expect(result.reason).not.toContain('turn');
    }
  });

  it('advances round on successful submission', () => {
    // Need to construct a valid move with tiles from the shared rack
    // Place a tile that forms a valid word on center
    const rack = state.sharedRack!;
    // Find tiles that could form a 2-letter word at center
    // We'll try to form any valid word — if the rack doesn't have the right tiles
    // for the test dictionary, we'll create a custom state
    const customState: GameState = {
      ...state,
      sharedRack: [
        { id: 'c1', letter: 'C', value: 3, isBlank: false },
        { id: 'a1', letter: 'A', value: 1, isBlank: false },
        { id: 't1', letter: 'T', value: 1, isBlank: false },
        ...rack.slice(3),
      ],
    };

    const tiles: PlacedTile[] = [
      { id: 'c1', letter: 'C', value: 3, isBlank: false, row: 7, col: 6, designatedLetter: 'C' },
      { id: 'a1', letter: 'A', value: 1, isBlank: false, row: 7, col: 7, designatedLetter: 'A' },
      { id: 't1', letter: 'T', value: 1, isBlank: false, row: 7, col: 8, designatedLetter: 'T' },
    ];

    const result = submitRacingMove(customState, 0, tiles, dict);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.racingRound).toBe(2);
      expect(result.state.consecutiveSkippedRounds).toBe(0);
      expect(result.formedWords).toContain('CAT');
      expect(result.score).toBeGreaterThan(0);
      // Score should be added to the submitting player
      expect(result.state.players[0].score).toBe(result.score);
      expect(result.state.players[1].score).toBe(0);
    }
  });

  it('carries over unused tiles and refills rack to 7', () => {
    const rack = state.sharedRack!;
    const customState: GameState = {
      ...state,
      sharedRack: [
        { id: 'c1', letter: 'C', value: 3, isBlank: false },
        { id: 'a1', letter: 'A', value: 1, isBlank: false },
        { id: 't1', letter: 'T', value: 1, isBlank: false },
        ...rack.slice(3),
      ],
    };

    const tiles: PlacedTile[] = [
      { id: 'c1', letter: 'C', value: 3, isBlank: false, row: 7, col: 6, designatedLetter: 'C' },
      { id: 'a1', letter: 'A', value: 1, isBlank: false, row: 7, col: 7, designatedLetter: 'A' },
      { id: 't1', letter: 'T', value: 1, isBlank: false, row: 7, col: 8, designatedLetter: 'T' },
    ];

    const result = submitRacingMove(customState, 0, tiles, dict);
    expect(result.success).toBe(true);
    if (result.success) {
      // 4 tiles from previous rack carried over + 3 drawn = 7
      expect(result.state.sharedRack).toHaveLength(HAND_SIZE);
      // The 4 unused tiles should still be in the rack
      const newRackIds = new Set(result.state.sharedRack!.map((t) => t.id));
      for (const unusedTile of rack.slice(3)) {
        expect(newRackIds.has(unusedTile.id)).toBe(true);
      }
    }
  });
});

describe('handleRacingRoundTimeout', () => {
  let state: GameState;

  beforeEach(() => {
    state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);
  });

  it('increments consecutiveSkippedRounds', () => {
    const result = handleRacingRoundTimeout(state);
    expect(result.state.consecutiveSkippedRounds).toBe(1);
    expect(result.gameOver).toBe(false);
  });

  it('advances to next round', () => {
    const result = handleRacingRoundTimeout(state);
    expect(result.state.racingRound).toBe(2);
  });

  it('draws a fresh rack', () => {
    const oldRackIds = state.sharedRack!.map((t) => t.id);
    const result = handleRacingRoundTimeout(state);
    // New rack should have 7 tiles (or fewer if bag was near-empty)
    expect(result.state.sharedRack!.length).toBeLessThanOrEqual(HAND_SIZE);
    expect(result.state.sharedRack!.length).toBeGreaterThan(0);
    // New rack tiles should be different from the old ones
    const newRackIds = result.state.sharedRack!.map((t) => t.id);
    // At least some tiles should differ (old rack is discarded, new tiles drawn from bag)
    expect(newRackIds).not.toEqual(oldRackIds);
  });

  it('ends game after two consecutive skipped rounds', () => {
    const result1 = handleRacingRoundTimeout(state);
    expect(result1.state.phase).toBe('playing');
    const result2 = handleRacingRoundTimeout(result1.state);
    expect(result2.state.phase).toBe('finished');
    expect(result2.gameOver).toBe(true);
    expect(result2.state.endReason).toBe('Two consecutive rounds skipped');
  });

  it('is a no-op when phase is not playing', () => {
    const finishedState = { ...state, phase: 'finished' as const };
    const result = handleRacingRoundTimeout(finishedState);
    expect(result.state).toBe(finishedState);
    expect(result.gameOver).toBe(false);
  });
});

describe('checkRacingEndConditions', () => {
  it('ends game when bag and rack are empty', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      tileBag: [],
      sharedRack: [],
      players: [
        { ...state.players[0], score: 100 },
        { ...state.players[1], score: 50 },
      ],
    };

    const result = checkRacingEndConditions(modifiedState);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBe(0);
    expect(result.endReason).toBe('All tiles used');
  });

  it('declares player 1 winner when they have higher score', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      tileBag: [],
      sharedRack: [],
      players: [
        { ...state.players[0], score: 30 },
        { ...state.players[1], score: 80 },
      ],
    };

    const result = checkRacingEndConditions(modifiedState);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBe(1);
  });

  it('declares draw when scores are equal', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      tileBag: [],
      sharedRack: [],
      players: [
        { ...state.players[0], score: 50 },
        { ...state.players[1], score: 50 },
      ],
    };

    const result = checkRacingEndConditions(modifiedState);
    expect(result.phase).toBe('finished');
    expect(result.winnerIndex).toBeNull();
  });

  it('does not end game if rack still has tiles', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      tileBag: [],
      // sharedRack still has tiles from creation
    };

    const result = checkRacingEndConditions(modifiedState);
    expect(result.phase).toBe('playing');
  });

  it('does not end game if bag still has tiles', () => {
    const state = createRacingGame('room-1', 'p0', 'p1', RACING_CONFIG, TEST_SEED);

    const modifiedState: GameState = {
      ...state,
      sharedRack: [],
      // tileBag still has tiles from creation
    };

    const result = checkRacingEndConditions(modifiedState);
    expect(result.phase).toBe('playing');
  });
});

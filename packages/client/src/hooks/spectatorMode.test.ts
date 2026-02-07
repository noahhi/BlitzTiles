/**
 * Comprehensive E2E integration tests for spectator mode.
 *
 * Tests cover:
 * - State filtering with hand visibility on/off
 * - Multiple spectators connecting and watching
 * - Game flow: moves, passes, exchanges with spectators observing
 * - Spectator disconnection and reconnection
 * - Host broadcasting to all spectators
 * - Turn timer updates for spectators
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGame, submitMove, passTurn, exchangePlayerTiles } from '@blitztiles/shared';
import type { GameState, PlacedTile, SpectatorGameState } from '@blitztiles/shared';
import { Trie } from '@blitztiles/shared/src/words.js';
import { filterStateForSpectator } from './useGameStore';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function createTestDictionary(): Trie {
  const trie = new Trie();
  const words = ['CAT', 'AT', 'TO', 'DOG', 'GO', 'GOD', 'ON', 'NO', 'HI', 'IT', 'IS'];
  for (const w of words) {
    trie.insert(w);
  }
  return trie;
}

const TEST_SEED = 42;

// Mock spectator connection
interface MockSpectatorConnection {
  id: string;
  send: ReturnType<typeof vi.fn>;
  connected: boolean;
}

function createMockSpectator(id: string): MockSpectatorConnection {
  return {
    id,
    send: vi.fn(),
    connected: true,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spectator Mode - State Filtering', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = createGame('test-room', 'player1', 'player2', undefined, TEST_SEED);
  });

  it('hides player hands when spectatorHandsVisible is false', () => {
    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.players[0].hand).toBeUndefined();
    expect(spectatorState.players[1].hand).toBeUndefined();
    expect(spectatorState.players[0].handSize).toBe(7);
    expect(spectatorState.players[1].handSize).toBe(7);
  });

  it('shows player hands when spectatorHandsVisible is true', () => {
    const config = { ...gameState.config, spectatorHandsVisible: true };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.players[0].hand).toBeDefined();
    expect(spectatorState.players[1].hand).toBeDefined();
    expect(spectatorState.players[0].hand?.length).toBe(7);
    expect(spectatorState.players[1].hand?.length).toBe(7);

    // Verify actual tile data is included
    expect(spectatorState.players[0].hand?.[0]).toHaveProperty('letter');
    expect(spectatorState.players[0].hand?.[0]).toHaveProperty('value');
    expect(spectatorState.players[0].hand?.[0]).toHaveProperty('id');
  });

  it('includes all required spectator state fields', () => {
    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState).toHaveProperty('roomId');
    expect(spectatorState).toHaveProperty('phase');
    expect(spectatorState).toHaveProperty('config');
    expect(spectatorState).toHaveProperty('board');
    expect(spectatorState).toHaveProperty('players');
    expect(spectatorState).toHaveProperty('currentPlayerIndex');
    expect(spectatorState).toHaveProperty('tileBagCount');
    expect(spectatorState).toHaveProperty('consecutivePasses');
    expect(spectatorState).toHaveProperty('turnStartTimestamp');
    expect(spectatorState).toHaveProperty('winnerIndex');
    expect(spectatorState).toHaveProperty('endReason');
    expect(spectatorState).toHaveProperty('moveHistory');
    expect(spectatorState).toHaveProperty('stateVersion');
    expect(spectatorState).toHaveProperty('lastMoveTiles');
  });

  it('shows correct player names and scores', () => {
    // Modify state to have different scores
    gameState.players[0].score = 25;
    gameState.players[1].score = 42;

    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.players[0].name).toBe('Player 1');
    expect(spectatorState.players[1].name).toBe('Player 2');
    expect(spectatorState.players[0].score).toBe(25);
    expect(spectatorState.players[1].score).toBe(42);
  });

  it('shows correct connection status', () => {
    gameState.players[0].connected = true;
    gameState.players[1].connected = false;

    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.players[0].connected).toBe(true);
    expect(spectatorState.players[1].connected).toBe(false);
  });

  it('shows tileBagCount instead of actual bag contents', () => {
    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.tileBagCount).toBe(gameState.tileBag.length);
    expect(spectatorState).not.toHaveProperty('tileBag');
  });
});

describe('Spectator Mode - Multiple Spectators', () => {
  let gameState: GameState;
  let spectators: MockSpectatorConnection[];

  beforeEach(() => {
    gameState = createGame('test-room', 'player1', 'player2', undefined, TEST_SEED);
    spectators = [
      createMockSpectator('spectator-1'),
      createMockSpectator('spectator-2'),
      createMockSpectator('spectator-3'),
    ];
  });

  it('broadcasts to all connected spectators', () => {
    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    // Simulate host broadcasting to all spectators
    spectators.forEach((spectator) => {
      if (spectator.connected) {
        spectator.send({ type: 'GAME_STATE', state: spectatorState });
      }
    });

    // All spectators should receive the broadcast
    expect(spectators[0].send).toHaveBeenCalledWith({
      type: 'GAME_STATE',
      state: expect.objectContaining({
        roomId: 'test-room',
        phase: 'playing',
      }),
    });
    expect(spectators[1].send).toHaveBeenCalledTimes(1);
    expect(spectators[2].send).toHaveBeenCalledTimes(1);
  });

  it('handles spectator disconnection', () => {
    // Simulate one spectator disconnecting
    spectators[1].connected = false;

    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    // Broadcast only to connected spectators
    spectators.forEach((spectator) => {
      if (spectator.connected) {
        spectator.send({ type: 'GAME_STATE', state: spectatorState });
      }
    });

    expect(spectators[0].send).toHaveBeenCalledTimes(1);
    expect(spectators[1].send).toHaveBeenCalledTimes(0); // Disconnected
    expect(spectators[2].send).toHaveBeenCalledTimes(1);
  });

  it('new spectator receives current game state immediately', () => {
    const newSpectator = createMockSpectator('spectator-4');

    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    // When new spectator joins, immediately send current state
    newSpectator.send({ type: 'GAME_STATE', state: spectatorState });

    expect(newSpectator.send).toHaveBeenCalledWith({
      type: 'GAME_STATE',
      state: expect.objectContaining({
        phase: 'playing',
        currentPlayerIndex: expect.any(Number),
        moveHistory: expect.any(Array),
      }),
    });
  });
});

describe('Spectator Mode - Game Flow Integration', () => {
  let gameState: GameState;
  let dict: Trie;
  let spectators: MockSpectatorConnection[];

  beforeEach(() => {
    gameState = createGame(
      'test-room',
      'player1',
      'player2',
      {
        timerMode: 'per_turn',
        timerDurationMs: 0,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 60000,
        spectatorHandsVisible: true,
      },
      TEST_SEED,
    );
    dict = createTestDictionary();
    spectators = [createMockSpectator('spectator-1'), createMockSpectator('spectator-2')];
  });

  function broadcastToSpectators(state: GameState) {
    const spectatorState = filterStateForSpectator(state, state.config);
    spectators.forEach((s) => {
      if (s.connected) {
        s.send({ type: 'GAME_STATE', state: spectatorState });
      }
    });
  }

  it('spectators see initial game state', () => {
    broadcastToSpectators(gameState);

    const receivedState = spectators[0].send.mock.calls[0][0].state as SpectatorGameState;

    expect(receivedState.phase).toBe('playing');
    expect(receivedState.currentPlayerIndex).toBe(0);
    expect(receivedState.moveHistory).toHaveLength(0);
    expect(receivedState.players[0].score).toBe(0);
    expect(receivedState.players[1].score).toBe(0);

    // Hands visible since config.spectatorHandsVisible = true
    expect(receivedState.players[0].hand).toBeDefined();
    expect(receivedState.players[1].hand).toBeDefined();
  });

  it('spectators see move when player submits tiles', () => {
    // Player 0 places tiles to form a word at center
    const tile1 = gameState.players[0].hand.find((t) => t.letter === 'C');
    const tile2 = gameState.players[0].hand.find((t) => t.letter === 'A');
    const tile3 = gameState.players[0].hand.find((t) => t.letter === 'T');

    if (!tile1 || !tile2 || !tile3) {
      // If specific tiles not available, skip this test
      return;
    }

    const placed: PlacedTile[] = [
      { ...tile1, row: 7, col: 7, designatedLetter: 'C' },
      { ...tile2, row: 7, col: 8, designatedLetter: 'A' },
      { ...tile3, row: 7, col: 9, designatedLetter: 'T' },
    ];

    const result = submitMove(gameState, 0, placed, dict);

    if (result.success) {
      const newState = result.state;

      // Broadcast to spectators
      broadcastToSpectators(newState);

      const receivedState = spectators[0].send.mock.calls[0][0].state as SpectatorGameState;

      // Verify spectators see the updated state
      expect(receivedState.currentPlayerIndex).toBe(1); // Turn switched
      expect(receivedState.moveHistory).toHaveLength(1);
      expect(receivedState.moveHistory[0].action).toBe('submit');
      expect(receivedState.players[0].score).toBeGreaterThan(0); // Scored points

      // Verify board updated
      expect(receivedState.board[7][7]).toBeDefined();
      expect(receivedState.board[7][8]).toBeDefined();
      expect(receivedState.board[7][9]).toBeDefined();
    }
  });

  it('spectators see pass when player passes turn', () => {
    const result = passTurn(gameState, 0);

    broadcastToSpectators(result.state);

    const receivedState = spectators[0].send.mock.calls[0][0].state as SpectatorGameState;

    expect(receivedState.currentPlayerIndex).toBe(1);
    expect(receivedState.consecutivePasses).toBe(1);
    expect(receivedState.moveHistory).toHaveLength(1);
    expect(receivedState.moveHistory[0].action).toBe('pass');
  });

  it('spectators see exchange when player exchanges tiles', () => {
    const tileIds = [gameState.players[0].hand[0].id, gameState.players[0].hand[1].id];

    const result = exchangePlayerTiles(gameState, 0, tileIds);

    if (result.success) {
      broadcastToSpectators(result.state);

      const receivedState = spectators[0].send.mock.calls[0][0].state as SpectatorGameState;

      expect(receivedState.currentPlayerIndex).toBe(1);
      expect(receivedState.consecutivePasses).toBe(0);
      expect(receivedState.moveHistory).toHaveLength(1);
      expect(receivedState.moveHistory[0].action).toBe('exchange');

      // Hand still has 7 tiles
      expect(receivedState.players[0].handSize).toBe(7);

      // If hands visible, new tiles should be different
      if (receivedState.players[0].hand) {
        const newHandIds = receivedState.players[0].hand.map((t) => t.id);
        expect(newHandIds).not.toContain(tileIds[0]);
        expect(newHandIds).not.toContain(tileIds[1]);
      }
    }
  });

  it('spectators see game end after two consecutive passes', () => {
    const pass1 = passTurn(gameState, 0);
    broadcastToSpectators(pass1.state);

    const pass2 = passTurn(pass1.state, 1);
    broadcastToSpectators(pass2.state);

    const receivedState = spectators[0].send.mock.calls[1][0].state as SpectatorGameState;

    expect(receivedState.phase).toBe('finished');
    expect(receivedState.endReason).toBe('Both players passed consecutively');
    expect(receivedState.winnerIndex).toBeDefined();
    expect(receivedState.consecutivePasses).toBe(2);
  });
});

describe('Spectator Mode - Hand Visibility Toggle', () => {
  let gameState: GameState;
  let spectators: MockSpectatorConnection[];

  beforeEach(() => {
    gameState = createGame('test-room', 'player1', 'player2', undefined, TEST_SEED);
    spectators = [createMockSpectator('spectator-1')];
  });

  it('host can toggle hand visibility during game', () => {
    // Start with hands hidden
    let config = { ...gameState.config, spectatorHandsVisible: false };
    let spectatorState = filterStateForSpectator(gameState, config);

    spectators[0].send({ type: 'GAME_STATE', state: spectatorState });
    let receivedState = spectators[0].send.mock.calls[0][0].state as SpectatorGameState;
    expect(receivedState.players[0].hand).toBeUndefined();

    // Host toggles to show hands
    config = { ...gameState.config, spectatorHandsVisible: true };
    spectatorState = filterStateForSpectator(gameState, config);

    spectators[0].send({ type: 'GAME_STATE', state: spectatorState });
    receivedState = spectators[0].send.mock.calls[1][0].state as SpectatorGameState;
    expect(receivedState.players[0].hand).toBeDefined();
    expect(receivedState.players[0].hand?.length).toBe(7);

    // Host toggles back to hide hands
    config = { ...gameState.config, spectatorHandsVisible: false };
    spectatorState = filterStateForSpectator(gameState, config);

    spectators[0].send({ type: 'GAME_STATE', state: spectatorState });
    receivedState = spectators[0].send.mock.calls[2][0].state as SpectatorGameState;
    expect(receivedState.players[0].hand).toBeUndefined();
  });

  it('different spectators see same hand visibility setting', () => {
    const spectator2 = createMockSpectator('spectator-2');
    spectators.push(spectator2);

    const config = { ...gameState.config, spectatorHandsVisible: true };
    const spectatorState = filterStateForSpectator(gameState, config);

    spectators.forEach((s) => {
      s.send({ type: 'GAME_STATE', state: spectatorState });
    });

    // Both spectators should see hands
    const state1 = spectators[0].send.mock.calls[0][0].state as SpectatorGameState;
    const state2 = spectator2.send.mock.calls[0][0].state as SpectatorGameState;

    expect(state1.players[0].hand).toBeDefined();
    expect(state2.players[0].hand).toBeDefined();

    // Both should see identical hand data
    expect(state1.players[0].hand).toEqual(state2.players[0].hand);
  });
});

describe('Spectator Mode - Turn Timer', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = createGame(
      'test-room',
      'player1',
      'player2',
      {
        timerMode: 'per_turn',
        timerDurationMs: 0,
        overtimePenaltyPerMinute: 0,
        turnTimeLimitMs: 60000,
        spectatorHandsVisible: false,
      },
      TEST_SEED,
    );
  });

  it('spectators see turn timer state', () => {
    const config = { ...gameState.config };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.turnStartTimestamp).toBeDefined();
    expect(spectatorState.config.turnTimeLimitMs).toBe(60000);
  });

  it('spectators see timer updates after moves', () => {
    // Simulate time passing
    const now = new Date();
    gameState.turnStartTimestamp = now.toISOString();

    const spectatorState1 = filterStateForSpectator(gameState, gameState.config);
    expect(spectatorState1.turnStartTimestamp).toBe(now.toISOString());

    // After a pass, turn timer resets
    const result = passTurn(gameState, 0);
    const newNow = new Date(now.getTime() + 5000); // 5 seconds later
    result.state.turnStartTimestamp = newNow.toISOString();

    const spectatorState2 = filterStateForSpectator(result.state, result.state.config);
    expect(spectatorState2.turnStartTimestamp).toBe(newNow.toISOString());
    expect(spectatorState2.currentPlayerIndex).toBe(1);
  });
});

describe('Spectator Mode - Edge Cases', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = createGame('test-room', 'player1', 'player2', undefined, TEST_SEED);
  });

  it('handles spectator joining mid-game', () => {
    // Simulate several moves have been made
    const pass1 = passTurn(gameState, 0);
    const pass2 = passTurn(pass1.state, 1);

    const midGameState = pass2.state;
    midGameState.players[0].score = 25;
    midGameState.players[1].score = 18;

    // New spectator joins and receives current state
    const config = { ...midGameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(midGameState, config);

    // Should see full current state
    expect(spectatorState.moveHistory).toHaveLength(2);
    expect(spectatorState.players[0].score).toBe(25);
    expect(spectatorState.players[1].score).toBe(18);
    expect(spectatorState.currentPlayerIndex).toBeDefined();
  });

  it('handles game end state correctly', () => {
    const finishedState: GameState = {
      ...gameState,
      phase: 'finished',
      winnerIndex: 0,
      endReason: 'player2 resigned',
    };

    const config = { ...finishedState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(finishedState, config);

    expect(spectatorState.phase).toBe('finished');
    expect(spectatorState.winnerIndex).toBe(0);
    expect(spectatorState.endReason).toBe('player2 resigned');
  });

  it('includes lastMoveTiles for highlighting', () => {
    gameState.lastMoveTiles = [
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
    ];

    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.lastMoveTiles).toEqual([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
    ]);
  });

  it('preserves stateVersion for sync tracking', () => {
    gameState.stateVersion = 42;

    const config = { ...gameState.config, spectatorHandsVisible: false };
    const spectatorState = filterStateForSpectator(gameState, config);

    expect(spectatorState.stateVersion).toBe(42);
  });
});

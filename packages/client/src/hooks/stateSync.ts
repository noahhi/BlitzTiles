/**
 * Functions to sync the Zustand store from various game state shapes,
 * and to filter full GameState for different recipients.
 */

import type {
  ClientGameState,
  GameConfig,
  GameState,
  SpectatorGameState,
} from '@blitztiles/shared';
import type { GameStore } from './storeTypes';

// ---------------------------------------------------------------------------
// Sync helpers: full state → store partial
// ---------------------------------------------------------------------------

/** Sync store from full GameState (local + host modes). */
export function syncFromGameState(state: GameState, viewAsPlayer: number): Partial<GameStore> {
  const isRacing = state.config.gameVariant === 'racing';
  return {
    phase: state.phase,
    board: state.board,
    currentPlayerIndex: state.currentPlayerIndex,
    players: state.players.map((p) => ({
      name: p.name,
      score: p.score,
      handSize: isRacing ? (state.sharedRack?.length ?? 0) : p.hand.length,
      timeRemainingMs: p.timeRemainingMs,
    })),
    currentHand: isRacing ? (state.sharedRack ?? []) : state.players[viewAsPlayer].hand,
    tileBagCount: state.tileBag.length,
    consecutivePasses: state.consecutivePasses,
    winnerIndex: state.winnerIndex,
    endReason: state.endReason,
    moveHistory: state.moveHistory,
    turnTimeLimitMs: state.config.turnTimeLimitMs ?? 0,
    turnStartTimestamp: state.turnStartTimestamp,
    lastMoveTiles: state.lastMoveTiles,
    config: state.config,
    gameVariant: state.config.gameVariant,
    racingRound: state.racingRound,
    roundStartTimestamp: state.roundStartTimestamp,
    racingRoundTimeLimitMs: state.config.racingRoundTimeLimitMs ?? 0,
    _gameState: state,
  };
}

/** Sync store from filtered ClientGameState (guest mode). */
export function syncFromClientGameState(clientState: ClientGameState): Partial<GameStore> {
  const myIndex = clientState.yourPlayerIndex;
  const opIndex = myIndex === 0 ? 1 : 0;
  const isRacing = clientState.config.gameVariant === 'racing';

  const players: GameStore['players'] = [];
  players[myIndex] = {
    name: clientState.you.name,
    score: clientState.you.score,
    handSize: isRacing ? (clientState.sharedRack?.length ?? 0) : clientState.you.hand.length,
    timeRemainingMs: clientState.you.timeRemainingMs,
  };
  players[opIndex] = {
    name: clientState.opponent.name,
    score: clientState.opponent.score,
    handSize: isRacing ? (clientState.sharedRack?.length ?? 0) : clientState.opponent.handSize,
    timeRemainingMs: clientState.opponent.timeRemainingMs,
  };

  return {
    phase: clientState.phase,
    board: clientState.board,
    currentPlayerIndex: clientState.currentPlayerIndex,
    players,
    currentHand: isRacing ? (clientState.sharedRack ?? []) : clientState.you.hand,
    tileBagCount: clientState.tileBagCount,
    consecutivePasses: clientState.consecutivePasses,
    winnerIndex: clientState.winnerIndex,
    endReason: clientState.endReason,
    moveHistory: clientState.moveHistory,
    turnTimeLimitMs: clientState.config.turnTimeLimitMs ?? 0,
    turnStartTimestamp: clientState.turnStartTimestamp,
    lastMoveTiles: clientState.lastMoveTiles,
    config: clientState.config,
    gameVariant: clientState.config.gameVariant,
    racingRound: clientState.racingRound,
    roundStartTimestamp: clientState.roundStartTimestamp,
    racingRoundTimeLimitMs: clientState.config.racingRoundTimeLimitMs ?? 0,
    playerIndex: myIndex,
  };
}

/** Sync store from SpectatorGameState (spectator mode). */
export function syncFromSpectatorGameState(spectatorState: SpectatorGameState): Partial<GameStore> {
  return {
    phase: spectatorState.phase,
    board: spectatorState.board,
    currentPlayerIndex: spectatorState.currentPlayerIndex,
    players: spectatorState.players.map((p) => ({
      name: p.name,
      score: p.score,
      handSize: p.handSize,
      timeRemainingMs: p.timeRemainingMs,
      ...(p.hand && { hand: p.hand }), // Include hand if spectatorHandsVisible is true
    })),
    currentHand: [], // Spectators never have a hand
    tileBagCount: spectatorState.tileBagCount,
    consecutivePasses: spectatorState.consecutivePasses,
    winnerIndex: spectatorState.winnerIndex,
    endReason: spectatorState.endReason,
    moveHistory: spectatorState.moveHistory,
    turnTimeLimitMs: spectatorState.config.turnTimeLimitMs ?? 0,
    turnStartTimestamp: spectatorState.turnStartTimestamp,
    lastMoveTiles: spectatorState.lastMoveTiles,
    config: spectatorState.config,
    playerIndex: -1, // Spectator is not a player
  };
}

// ---------------------------------------------------------------------------
// Filter helpers: full state → recipient-specific view
// ---------------------------------------------------------------------------

/** Filter full GameState into a ClientGameState for a specific player. */
export function filterStateForPlayer(state: GameState, forPlayer: number): ClientGameState {
  const opponentIndex = forPlayer === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];

  return {
    roomId: state.roomId,
    phase: state.phase,
    config: state.config,
    board: state.board,
    you: state.players[forPlayer],
    opponent: {
      name: opponent.name,
      score: opponent.score,
      timeRemainingMs: opponent.timeRemainingMs,
      handSize: opponent.hand.length,
      connected: opponent.connected,
    },
    currentPlayerIndex: state.currentPlayerIndex,
    yourPlayerIndex: forPlayer,
    tileBagCount: state.tileBag.length,
    consecutivePasses: state.consecutivePasses,
    turnStartTimestamp: state.turnStartTimestamp,
    winnerIndex: state.winnerIndex,
    endReason: state.endReason,
    moveHistory: state.moveHistory,
    stateVersion: state.stateVersion,
    lastMoveTiles: state.lastMoveTiles,
    sharedRack: state.sharedRack,
    racingRound: state.racingRound,
    consecutiveSkippedRounds: state.consecutiveSkippedRounds,
    roundStartTimestamp: state.roundStartTimestamp,
  };
}

/** Filter full GameState into a SpectatorGameState. */
export function filterStateForSpectator(state: GameState, config: GameConfig): SpectatorGameState {
  const includeHands = config.spectatorHandsVisible ?? false;

  return {
    roomId: state.roomId,
    phase: state.phase,
    config: state.config,
    board: state.board,
    players: [
      {
        name: state.players[0].name,
        score: state.players[0].score,
        timeRemainingMs: state.players[0].timeRemainingMs,
        handSize: state.players[0].hand.length,
        connected: state.players[0].connected,
        ...(includeHands && { hand: state.players[0].hand }),
      },
      {
        name: state.players[1].name,
        score: state.players[1].score,
        timeRemainingMs: state.players[1].timeRemainingMs,
        handSize: state.players[1].hand.length,
        connected: state.players[1].connected,
        ...(includeHands && { hand: state.players[1].hand }),
      },
    ],
    currentPlayerIndex: state.currentPlayerIndex,
    tileBagCount: state.tileBag.length,
    consecutivePasses: state.consecutivePasses,
    turnStartTimestamp: state.turnStartTimestamp,
    winnerIndex: state.winnerIndex,
    endReason: state.endReason,
    moveHistory: state.moveHistory,
    stateVersion: state.stateVersion,
    lastMoveTiles: state.lastMoveTiles,
  };
}

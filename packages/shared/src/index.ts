// Types
export type {
  Tile,
  PlacedTile,
  BonusType,
  BoardCell,
  Board,
  PlayerState,
  TimerMode,
  GameVariant,
  GameConfig,
  GamePhase,
  GameState,
  MoveRecord,
  ClientMessage,
  ClientGameState,
  ServerMessage,
} from './types.js';

// Constants
export {
  TILE_DISTRIBUTION,
  TOTAL_TILE_COUNT,
  HAND_SIZE,
  BOARD_SIZE,
  CENTER,
  BINGO_BONUS,
  BONUS_MAP,
  DEFAULT_GAME_CONFIG,
  DEFAULT_TURN_TIME_LIMIT_MS,
  DEFAULT_RACING_ROUND_TIME_LIMIT_MS,
} from './constants.js';

// Tile bag
export { createTileBag, drawTiles, exchangeTiles } from './tileBag.js';

// Board
export { createEmptyBoard, isValidPlacement, getFormedWords } from './board.js';

// Scoring
export { scoreTurn, getEndGameBonus } from './scoring.js';

// Words / Dictionary
export { Trie, loadDictionary, loadCompressedDictionary, generateRoomCode } from './words.js';

// Game engine
export {
  createGame,
  submitMove,
  passTurn,
  exchangeTiles as exchangePlayerTiles,
  resignGame,
  handleTurnTimeout,
  handleTimerExpiry,
  updatePlayerTime,
  checkEndConditions,
} from './gameEngine.js';

export type {
  MoveResult,
  MoveError,
  SubmitMoveResult,
  PassResult,
  ExchangeResult,
  ExchangeError,
  ExchangeTilesResult,
} from './gameEngine.js';

// Racing engine
export {
  createRacingGame,
  submitRacingMove,
  handleRacingRoundTimeout,
  checkRacingEndConditions,
} from './racingEngine.js';

export type {
  RacingMoveResult,
  RacingMoveError,
  SubmitRacingMoveResult,
  RacingTimeoutResult,
} from './racingEngine.js';

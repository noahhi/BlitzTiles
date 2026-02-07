# Patterns & Gotchas

## GameConfig — All Fields Required

When constructing `GameConfig` in tests or anywhere, every field must be provided:

```typescript
{
  timerMode: 'per_turn',       // or 'sudden_death', 'time_penalty', 'untimed'
  timerDurationMs: 0,
  overtimePenaltyPerMinute: 0,
  turnTimeLimitMs: 60000,      // required since timer implementation
}
```

Missing `turnTimeLimitMs` will cause TypeScript errors.

## Store Sync Functions

Two separate sync paths:

- `syncFromGameState(state, viewAsPlayer)` — used in local + host modes (full GameState)
- `syncFromClientGameState(clientState)` — used in guest mode (filtered ClientGameState)

Both must be kept in sync when adding new store fields.

## Timeout Scheduling

- `scheduleTurnTimeout(get, set)` — module-level, not inside Zustand
- Must be called after EVERY `set()` that changes game state
- Skips if: mode is guest, timerMode isn't per_turn, or phase isn't playing
- Clears previous timeout before scheduling new one

## Testing

- Tests use `TEST_SEED = 42` for deterministic tile bags
- Test dictionary is a small subset via `createTestDictionary()` (Trie)
- `AcceptAllTrie` used in client for dev mode (no dictionary validation yet)
- Run `pnpm --filter shared test` for fast iteration on shared package

## CSS Variables Available

- `--success: #27ae60` (green)
- `--warning: #f39c12` (amber)
- `--danger: #e74c3c` (red)
- `--bg-secondary`, `--text`, `--text-muted`, `--accent`

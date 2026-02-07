/**
 * Tile bag management: creation, drawing, and exchanging tiles.
 *
 * All functions are pure — no mutation of inputs, no side effects.
 * Shuffling uses a seeded PRNG (mulberry32) so games are deterministic
 * and reproducible given the same seed.
 */

import type { Tile } from './types.js';
import { TILE_DISTRIBUTION } from './constants.js';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

/**
 * Returns a mulberry32 PRNG function seeded with `seed`.
 * Each call to the returned function produces the next pseudo-random
 * number in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by a seeded PRNG.
 * Returns a new array; the input is never mutated.
 */
function shuffle<T>(array: readonly T[], seed: number): T[] {
  const result = array.slice();
  const rng = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a full tile bag (100 tiles) from TILE_DISTRIBUTION, shuffled with
 * a seeded PRNG.
 *
 * @param seed - Optional seed for the PRNG. If omitted, `Date.now()` is used.
 * @returns The shuffled tiles and the seed that was used (so the game can be
 *          replayed deterministically).
 */
export function createTileBag(seed?: number): { tiles: Tile[]; seed: number } {
  const usedSeed = seed ?? Date.now();

  const tiles: Tile[] = [];
  let id = 0;

  for (const [letter, count, value] of TILE_DISTRIBUTION) {
    const isBlank = letter === '';
    for (let i = 0; i < count; i++) {
      tiles.push({
        id: `tile-${id}`,
        letter,
        value,
        isBlank,
      });
      id++;
    }
  }

  return { tiles: shuffle(tiles, usedSeed), seed: usedSeed };
}

/**
 * Draws tiles from the front of the bag.
 *
 * If the bag contains fewer tiles than `count`, all remaining tiles are drawn.
 * The input array is never mutated.
 *
 * @returns The drawn tiles and the remaining bag.
 */
export function drawTiles(bag: Tile[], count: number): { drawn: Tile[]; remaining: Tile[] } {
  const actual = Math.min(count, bag.length);
  return {
    drawn: bag.slice(0, actual),
    remaining: bag.slice(actual),
  };
}

/**
 * Exchanges tiles: draws `count` new tiles from the front of the bag, then
 * appends `tilesToReturn` to the end.
 *
 * The exchange is only valid when the bag contains at least `count` tiles.
 * Returns `null` if the bag is too small.
 *
 * The input arrays are never mutated.
 *
 * @returns The drawn tiles and the new bag state, or `null` if invalid.
 */
export function exchangeTiles(
  bag: Tile[],
  tilesToReturn: Tile[],
  count: number,
): { drawn: Tile[]; newBag: Tile[] } | null {
  if (bag.length < count) {
    return null;
  }

  const drawn = bag.slice(0, count);
  const remaining = bag.slice(count);
  const newBag = [...remaining, ...tilesToReturn];

  return { drawn, newBag };
}

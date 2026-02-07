import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Trie, loadDictionary, loadCompressedDictionary, generateRoomCode } from './words';

describe('Trie', () => {
  it('insert and has: basic word lookup works', () => {
    const trie = new Trie();
    trie.insert('HELLO');
    expect(trie.has('HELLO')).toBe(true);
  });

  it('is case-insensitive', () => {
    const trie = new Trie();
    trie.insert('hello');
    expect(trie.has('HELLO')).toBe(true);
    expect(trie.has('Hello')).toBe(true);
    expect(trie.has('hello')).toBe(true);
  });

  it('returns false for missing words', () => {
    const trie = new Trie();
    trie.insert('HELLO');
    expect(trie.has('WORLD')).toBe(false);
    expect(trie.has('HEL')).toBe(false);
  });

  it('returns false for empty string', () => {
    const trie = new Trie();
    trie.insert('HELLO');
    expect(trie.has('')).toBe(false);
  });

  it('size tracks number of inserted words', () => {
    const trie = new Trie();
    expect(trie.size).toBe(0);
    trie.insert('CAT');
    expect(trie.size).toBe(1);
    trie.insert('DOG');
    expect(trie.size).toBe(2);
    trie.insert('FISH');
    expect(trie.size).toBe(3);
  });

  it('does not double-count duplicates', () => {
    const trie = new Trie();
    trie.insert('HELLO');
    trie.insert('HELLO');
    expect(trie.size).toBe(1);

    trie.insert('hello');
    expect(trie.size).toBe(1);
  });

  it('works with single-letter words', () => {
    const trie = new Trie();
    trie.insert('A');
    trie.insert('I');
    expect(trie.has('A')).toBe(true);
    expect(trie.has('I')).toBe(true);
    expect(trie.has('B')).toBe(false);
    expect(trie.size).toBe(2);
  });

  it('handles words that are prefixes of other words', () => {
    const trie = new Trie();
    trie.insert('CAT');
    trie.insert('CATS');
    expect(trie.has('CAT')).toBe(true);
    expect(trie.has('CATS')).toBe(true);
    expect(trie.size).toBe(2);
  });

  describe('wordsOfLength', () => {
    it('returns words within the specified length range', () => {
      const trie = new Trie();
      trie.insert('A'); // 1
      trie.insert('BE'); // 2
      trie.insert('CAT'); // 3
      trie.insert('DOGS'); // 4
      trie.insert('EAGLE'); // 5
      trie.insert('FRIGHT'); // 6

      const words4to5 = trie.wordsOfLength(4, 5);
      expect(words4to5).toContain('DOGS');
      expect(words4to5).toContain('EAGLE');
      expect(words4to5).not.toContain('CAT');
      expect(words4to5).not.toContain('FRIGHT');
      expect(words4to5).toHaveLength(2);
    });

    it('returns uppercase strings', () => {
      const trie = new Trie();
      trie.insert('hello');
      trie.insert('world');

      const words = trie.wordsOfLength(5, 5);
      expect(words).toContain('HELLO');
      expect(words).toContain('WORLD');
    });

    it('returns empty array when no words match', () => {
      const trie = new Trie();
      trie.insert('HI');
      trie.insert('BIG');

      expect(trie.wordsOfLength(5, 6)).toEqual([]);
    });

    it('returns empty array for empty trie', () => {
      const trie = new Trie();
      expect(trie.wordsOfLength(1, 10)).toEqual([]);
    });
  });
});

describe('loadDictionary', () => {
  it('parses multi-line text correctly', () => {
    const text = 'apple\nbanana\ncherry';
    const trie = loadDictionary(text);
    expect(trie.has('APPLE')).toBe(true);
    expect(trie.has('BANANA')).toBe(true);
    expect(trie.has('CHERRY')).toBe(true);
    expect(trie.size).toBe(3);
  });

  it('skips empty lines and trims whitespace', () => {
    const text = '  apple  \n\n  banana \n\n\n  cherry  \n';
    const trie = loadDictionary(text);
    expect(trie.has('APPLE')).toBe(true);
    expect(trie.has('BANANA')).toBe(true);
    expect(trie.has('CHERRY')).toBe(true);
    expect(trie.size).toBe(3);
  });

  it('handles \\r\\n line endings', () => {
    const text = 'dog\r\ncat\r\nfish\r\n';
    const trie = loadDictionary(text);
    expect(trie.has('DOG')).toBe(true);
    expect(trie.has('CAT')).toBe(true);
    expect(trie.has('FISH')).toBe(true);
    expect(trie.size).toBe(3);
  });
});

describe('loadCompressedDictionary', () => {
  const dictPath = resolve(__dirname, '../data/enable.txt.gz');

  it('loads the ENABLE dictionary from gzip', async () => {
    const gzipped = readFileSync(dictPath);
    const trie = await loadCompressedDictionary(new Uint8Array(gzipped));
    expect(trie.size).toBe(172837);
  });

  it('contains common English words', async () => {
    const gzipped = readFileSync(dictPath);
    const trie = await loadCompressedDictionary(new Uint8Array(gzipped));
    expect(trie.has('HELLO')).toBe(true);
    expect(trie.has('WORLD')).toBe(true);
    expect(trie.has('SCRABBLE')).toBe(true);
    expect(trie.has('ZYZZYVA')).toBe(true);
  });

  it('contains manually-added short words', async () => {
    const gzipped = readFileSync(dictPath);
    const trie = await loadCompressedDictionary(new Uint8Array(gzipped));
    // Critical Q-without-U words
    expect(trie.has('QI')).toBe(true);
    expect(trie.has('QIS')).toBe(true);
    // Other important 2-letter additions
    expect(trie.has('ZA')).toBe(true);
    expect(trie.has('DA')).toBe(true);
    expect(trie.has('GI')).toBe(true);
    expect(trie.has('OK')).toBe(true);
  });

  it('rejects nonsense strings', async () => {
    const gzipped = readFileSync(dictPath);
    const trie = await loadCompressedDictionary(new Uint8Array(gzipped));
    expect(trie.has('ZZZZZ')).toBe(false);
    expect(trie.has('ASDFGH')).toBe(false);
    expect(trie.has('XYZPDQ')).toBe(false);
  });
});

describe('generateRoomCode', () => {
  it('returns a valid dictionary word when given a trie', () => {
    const trie = new Trie();
    trie.insert('BLAZE');
    trie.insert('CRIMP');
    trie.insert('WORD');
    trie.insert('PUZZLE');

    const code = generateRoomCode(trie);
    expect(trie.has(code)).toBe(true);
    expect(code.length).toBeGreaterThanOrEqual(4);
    expect(code.length).toBeLessThanOrEqual(6);
  });

  it('returns uppercase', () => {
    const trie = new Trie();
    trie.insert('hello');

    const code = generateRoomCode(trie);
    expect(code).toBe('HELLO');
  });

  it('falls back to 5 random letters without a dictionary', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z]{5}$/);
  });

  it('falls back when trie has no words in range', () => {
    const trie = new Trie();
    trie.insert('HI'); // too short
    trie.insert('EXTRAORDINARY'); // too long

    const code = generateRoomCode(trie);
    expect(code).toMatch(/^[A-Z]{5}$/);
  });

  it('generates valid codes from the real ENABLE dictionary', async () => {
    const gzipped = readFileSync(resolve(__dirname, '../data/enable.txt.gz'));
    const trie = await loadCompressedDictionary(new Uint8Array(gzipped));

    // Generate several codes and verify they're all real words
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode(trie);
      expect(trie.has(code)).toBe(true);
      expect(code.length).toBeGreaterThanOrEqual(4);
      expect(code.length).toBeLessThanOrEqual(6);
      expect(code).toBe(code.toUpperCase());
    }
  });
});

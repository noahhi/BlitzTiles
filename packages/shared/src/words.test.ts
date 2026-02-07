import { describe, it, expect } from 'vitest';
import { Trie, loadDictionary } from './words';

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

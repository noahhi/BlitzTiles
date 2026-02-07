// Minimal type shims for web-standard APIs available in browsers and Node 18+
// but not included in the ES2022 TypeScript lib.
interface ReadableStreamReadResult<T> { done: boolean; value: T }
interface MinimalReader<T> { read(): Promise<ReadableStreamReadResult<T>> }
interface MinimalWriter<T> { write(chunk: T): Promise<void>; close(): Promise<void> }
interface MinimalReadableStream<T> { getReader(): MinimalReader<T> }
interface MinimalWritableStream<T> { getWriter(): MinimalWriter<T> }

declare class DecompressionStream {
  constructor(format: 'gzip' | 'deflate' | 'deflate-raw');
  readonly readable: MinimalReadableStream<Uint8Array>;
  readonly writable: MinimalWritableStream<Uint8Array>;
}

declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}

interface TrieNode {
  children: Record<string, TrieNode>;
  isEnd: boolean;
}

function createNode(): TrieNode {
  return { children: {}, isEnd: false };
}

export class Trie {
  private root: TrieNode = createNode();
  private _size = 0;

  insert(word: string): void {
    const upper = word.toUpperCase();
    let node = this.root;
    for (const ch of upper) {
      if (!node.children[ch]) {
        node.children[ch] = createNode();
      }
      node = node.children[ch];
    }
    if (!node.isEnd) {
      node.isEnd = true;
      this._size++;
    }
  }

  has(word: string): boolean {
    if (word.length === 0) return false;
    const upper = word.toUpperCase();
    let node = this.root;
    for (const ch of upper) {
      if (!node.children[ch]) return false;
      node = node.children[ch];
    }
    return node.isEnd;
  }

  get size(): number {
    return this._size;
  }
}

export function loadDictionary(text: string): Trie {
  const trie = new Trie();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      trie.insert(trimmed);
    }
  }
  return trie;
}

/**
 * Decompress a gzipped word list and load it into a Trie.
 * Uses the web-standard DecompressionStream API (supported in browsers and Node 18+).
 */
export async function loadCompressedDictionary(gzipped: Uint8Array): Promise<Trie> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const writePromise = writer.write(gzipped).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writePromise;

  const decoder = new TextDecoder();
  const text = chunks.map((c, i) =>
    decoder.decode(c, { stream: i < chunks.length - 1 })
  ).join('');

  return loadDictionary(text);
}

const DB_NAME = 'newsroom';
const STORE_NAME = 'files';
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
  });
  return dbPromise;
}

export async function dbGet(key: string): Promise<any> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbSet(key: string, value: any): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbKeys(): Promise<string[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

const BASE_DIR = 'newsroom';

export type SegmentId =
  | 'intro'
  | 'article1' | 'article2' | 'article3' | 'article4' | 'article5'
  | 'article6' | 'article7' | 'article8'
  | 'editorial'
  | 'outro';

export const ALL_SEGMENT_IDS: SegmentId[] = [
  'intro',
  'article1', 'article2', 'article3', 'article4', 'article5',
  'article6', 'article7', 'article8',
  'editorial',
  'outro',
];

export const SEGMENT_FILE_NAMES: Record<SegmentId, string> = {
  intro: 'intro.txt',
  article1: 'Article1.txt',
  article2: 'Article2.txt',
  article3: 'Article3.txt',
  article4: 'Article4.txt',
  article5: 'Article5.txt',
  article6: 'Article6.txt',
  article7: 'Article7.txt',
  article8: 'Article8.txt',
  editorial: 'Editorial.txt',
  outro: 'outro.txt',
};

// Selected articles persistence
export interface ArticleSource {
  url: string;
  title: string;
  source: string;
  description: string;
  text: string;
  wordCount: number;
  tier: 1 | 2 | 3;
}

export interface SelectedArticle {
  main: ArticleSource;
  backups: ArticleSource[];
  scope: 'local' | 'continent';
  topic: string;
}

export type SelectedArticlesMap = Record<string, SelectedArticle>;

function makeKey(filename: string): string {
  return `${BASE_DIR}/${filename}`;
}

/**
 * Write a segment file.
 */
export async function writeSegment(id: SegmentId, content: string): Promise<void> {
  const key = makeKey(SEGMENT_FILE_NAMES[id]);
  try {
    await dbSet(key, content);
  } catch (err) {
    console.error(`[fileManager] Failed to write ${key}:`, err);
    throw err;
  }
}

/**
 * Read a segment file.
 */
export async function readSegment(id: SegmentId): Promise<string> {
  const key = makeKey(SEGMENT_FILE_NAMES[id]);
  try {
    const result = await dbGet(key);
    return result ?? '';
  } catch (err) {
    console.error(`[fileManager] Failed to read ${key}:`, err);
    return '';
  }
}

/**
 * Write the full assembled script.
 */
export async function writeFullScript(content: string): Promise<void> {
  const key = makeKey('full_script.txt');
  try {
    await dbSet(key, content);
  } catch (err) {
    console.error(`[fileManager] Failed to write ${key}:`, err);
    throw err;
  }
}

/**
 * Read the full assembled script.
 */
export async function readFullScript(): Promise<string> {
  const key = makeKey('full_script.txt');
  try {
    const result = await dbGet(key);
    return result ?? '';
  } catch (err) {
    console.error(`[fileManager] Failed to read ${key}:`, err);
    return '';
  }
}

/**
 * Read all segment files into a map.
 */
export async function readAllSegments(): Promise<Record<SegmentId, string>> {
  const result = {} as Record<SegmentId, string>;
  for (const id of ALL_SEGMENT_IDS) {
    result[id] = await readSegment(id);
  }
  return result;
}

/**
 * Write multiple segments at once.
 */
export async function writeAllSegments(segments: Record<SegmentId, string>): Promise<void> {
  for (const id of ALL_SEGMENT_IDS) {
    if (segments[id] !== undefined) {
      await writeSegment(id, segments[id]);
    }
  }
}

/**
 * List all files in the newsroom directory.
 */
export async function listSegmentFiles(): Promise<Array<{ name: string; size: number }>> {
  try {
    const keys = await dbKeys();
    return keys
      .filter((k) => k.startsWith(`${BASE_DIR}/`) && !k.endsWith('.json') && !k.includes('/audio_'))
      .map((k) => {
        // Size is unknown without reading; return 0 for simplicity
        return { name: k.replace(`${BASE_DIR}/`, ''), size: 0 };
      });
  } catch {
    return [];
  }
}

/**
 * Delete all segment files and full_script.txt.
 */
export async function clearAllSegments(): Promise<void> {
  try {
    const keys = await dbKeys();
    for (const key of keys) {
      if (key.startsWith(`${BASE_DIR}/`)) {
        await dbDelete(key);
      }
    }
  } catch (err) {
    console.error('[fileManager] Failed to clear segments:', err);
    // Non-fatal: directory may not exist
  }
}

/**
 * Check if the newsroom directory exists.
 */
export async function segmentsExist(): Promise<boolean> {
  try {
    const keys = await dbKeys();
    return keys.some((k) => k.startsWith(`${BASE_DIR}/`));
  } catch {
    return false;
  }
}

/**
 * Get file info for a segment.
 */
export async function getSegmentInfo(id: SegmentId): Promise<{ exists: boolean; size: number }> {
  const key = makeKey(SEGMENT_FILE_NAMES[id]);
  try {
    const data = await dbGet(key);
    return { exists: data !== undefined, size: data?.length ?? 0 };
  } catch {
    return { exists: false, size: 0 };
  }
}

// Selected articles helpers

const SELECTED_ARTICLES_FILE = 'selected_articles.json';

export async function writeSelectedArticles(articles: SelectedArticlesMap): Promise<void> {
  const key = makeKey(SELECTED_ARTICLES_FILE);
  try {
    await dbSet(key, JSON.stringify(articles, null, 2));
  } catch (err) {
    console.error(`[fileManager] Failed to write ${key}:`, err);
    throw err;
  }
}

export async function readSelectedArticles(): Promise<SelectedArticlesMap> {
  const key = makeKey(SELECTED_ARTICLES_FILE);
  try {
    const result = await dbGet(key);
    if (!result) return {};
    return JSON.parse(result) as SelectedArticlesMap;
  } catch (err) {
    console.error(`[fileManager] Failed to read ${key}:`, err);
    return {};
  }
}

/**
 * Write an audio file as base64.
 */
export async function writeAudioFile(filename: string, base64Data: string): Promise<void> {
  const key = makeKey(filename);
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    await dbSet(key, bytes);
  } catch (err) {
    console.error(`[fileManager] Failed to write audio ${key}:`, err);
    throw err;
  }
}

/**
 * Read an audio file as base64.
 */
export async function readAudioFile(filename: string): Promise<string> {
  const key = makeKey(filename);
  try {
    const result = await dbGet(key);
    if (!result || !(result instanceof Uint8Array)) return '';
    let binary = '';
    for (let i = 0; i < result.length; i++) {
      binary += String.fromCharCode(result[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error(`[fileManager] Failed to read audio ${key}:`, err);
    return '';
  }
}

/**
 * Check if an audio file exists.
 */
export async function audioFileExists(filename: string): Promise<boolean> {
  const key = makeKey(filename);
  try {
    const data = await dbGet(key);
    return data !== undefined;
  } catch {
    return false;
  }
}

/**
 * Create an empty audio file on disk.
 */
export async function createAudioFile(filename: string): Promise<void> {
  const key = makeKey(filename);
  try {
    await dbSet(key, new Uint8Array(0));
  } catch (err) {
    console.error(`[fileManager] Failed to create audio file ${key}:`, err);
    throw err;
  }
}

/**
 * Append a binary chunk to an audio file.
 * Stores as Uint8Array in IndexedDB (no base64 encoding).
 */
export async function appendAudioChunk(filename: string, chunk: Uint8Array | Int8Array): Promise<void> {
  const key = makeKey(filename);
  const bytes = chunk instanceof Int8Array
    ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    : chunk;
  try {
    const existing = await dbGet(key);
    const existingBytes = existing instanceof Uint8Array ? existing : new Uint8Array(0);
    const combined = new Uint8Array(existingBytes.length + bytes.length);
    combined.set(existingBytes);
    combined.set(bytes, existingBytes.length);
    await dbSet(key, combined);
  } catch (err) {
    console.error(`[fileManager] Failed to append audio chunk to ${key}:`, err);
    throw err;
  }
}

/**
 * Get a playable URL for a podcast file without loading it into memory.
 * Returns a Blob URL for web playback.
 */
export async function getPodcastPlaybackUrl(filename: string): Promise<string | null> {
  const key = makeKey(filename);
  try {
    const data = await dbGet(key);
    if (!data || !(data instanceof Uint8Array) || data.length === 0) return null;
    const blob = new Blob([data as BlobPart], { type: 'audio/mpeg' });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error(`[fileManager] Failed to get podcast playback URL for ${key}:`, err);
    return null;
  }
}

/**
 * Download a finished podcast file.
 * Returns true if the download succeeded, false otherwise.
 */
export async function copyPodcastToDocuments(filename: string): Promise<boolean> {
  const key = makeKey(filename);
  try {
    const data = await dbGet(key);
    if (!data || !(data instanceof Uint8Array) || data.length === 0) return false;
    const blob = new Blob([data as BlobPart], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error(`[fileManager] Failed to download podcast:`, err);
    return false;
  }
}

/**
 * Read an audio file as a Uint8Array.
 */
export async function readAudioFileBinary(filename: string): Promise<Uint8Array | null> {
  const key = makeKey(filename);
  try {
    const data = await dbGet(key);
    if (!data || !(data instanceof Uint8Array)) return null;
    return data;
  } catch (err) {
    console.error(`[fileManager] Failed to read audio binary ${key}:`, err);
    return null;
  }
}

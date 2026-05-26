import { dbGet, dbSet, dbDelete, dbKeys } from '../lib/fileManager';

const RAW_PREFIX = 'raw';

function makeRawKey(wikiId: string, documentName: string): string {
  const safe = documentName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `${RAW_PREFIX}/${wikiId}/${safe}`;
}

/**
 * Store a raw source document immutably in IndexedDB.
 * The LLM reads raw sources but never modifies them.
 */
export async function storeRawSource(
  documentName: string,
  text: string,
  wikiId: string = 'default'
): Promise<void> {
  const key = makeRawKey(wikiId, documentName);
  await dbSet(key, text);
}

/**
 * Read a raw source document from IndexedDB.
 */
export async function readRawSource(
  documentName: string,
  wikiId: string = 'default'
): Promise<string | null> {
  const key = makeRawKey(wikiId, documentName);
  const data = await dbGet(key);
  return typeof data === 'string' ? data : null;
}

/**
 * List all stored raw source document names.
 */
export async function listRawSources(wikiId: string = 'default'): Promise<string[]> {
  const prefix = `${RAW_PREFIX}/${wikiId}/`;
  const keys = await dbKeys();
  return keys
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.replace(prefix, ''));
}

/**
 * Delete a raw source document.
 */
export async function deleteRawSource(
  documentName: string,
  wikiId: string = 'default'
): Promise<void> {
  const key = makeRawKey(wikiId, documentName);
  await dbDelete(key);
}

/**
 * Clear all raw source documents for a wiki.
 */
export async function clearRawSources(wikiId: string = 'default'): Promise<void> {
  const prefix = `${RAW_PREFIX}/${wikiId}/`;
  const keys = await dbKeys();
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      await dbDelete(key);
    }
  }
}

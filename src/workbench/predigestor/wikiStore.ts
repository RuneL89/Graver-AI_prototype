import { dbGet, dbSet } from '../lib/fileManager';
import { listWikiPages, clearWiki } from './schema';
import { listRawSources, clearRawSources } from './rawSources';

export interface WikiManifest {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  sourceCount: number;
}

const MANIFEST_KEY = 'wiki-manifest';

async function getManifest(): Promise<WikiManifest[]> {
  const data = await dbGet(MANIFEST_KEY);
  if (Array.isArray(data)) return data as WikiManifest[];
  return [];
}

async function setManifest(manifest: WikiManifest[]): Promise<void> {
  await dbSet(MANIFEST_KEY, manifest);
}

function makeWikiId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base}-${Date.now()}`;
}

/**
 * List all wikis from the manifest.
 */
export async function listWikis(): Promise<WikiManifest[]> {
  return getManifest();
}

/**
 * Create a new wiki and add it to the manifest.
 * Returns the new wiki's ID.
 */
export async function createWiki(name: string): Promise<string> {
  const manifest = await getManifest();
  const id = makeWikiId(name || 'untitled');
  const now = new Date().toISOString();
  const entry: WikiManifest = {
    id,
    name: name || 'Untitled Wiki',
    createdAt: now,
    updatedAt: now,
    pageCount: 0,
    sourceCount: 0,
  };
  manifest.push(entry);
  await setManifest(manifest);
  return id;
}

/**
 * Delete a wiki and all its data.
 */
export async function deleteWiki(id: string): Promise<void> {
  const manifest = await getManifest();
  const filtered = manifest.filter((w) => w.id !== id);
  await setManifest(filtered);
  await clearWiki(id);
  await clearRawSources(id);
}

/**
 * Get a single wiki's manifest entry.
 */
export async function getWikiManifest(id: string): Promise<WikiManifest | null> {
  const manifest = await getManifest();
  return manifest.find((w) => w.id === id) ?? null;
}

/**
 * Update a wiki manifest entry and recalculate counts from storage.
 */
export async function refreshWikiManifest(id: string): Promise<void> {
  const manifest = await getManifest();
  const idx = manifest.findIndex((w) => w.id === id);
  if (idx === -1) return;

  const pages = await listWikiPages(id);
  const sources = await listRawSources(id);

  manifest[idx] = {
    ...manifest[idx],
    pageCount: pages.length,
    sourceCount: sources.length,
    updatedAt: new Date().toISOString(),
  };
  await setManifest(manifest);
}

/**
 * Rename a wiki.
 */
export async function renameWiki(id: string, newName: string): Promise<void> {
  const manifest = await getManifest();
  const idx = manifest.findIndex((w) => w.id === id);
  if (idx === -1) return;
  manifest[idx].name = newName;
  manifest[idx].updatedAt = new Date().toISOString();
  await setManifest(manifest);
}

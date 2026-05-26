import { dbGet, dbSet, dbDelete, dbKeys } from '../lib/fileManager';

export const WIKI_BASE_DIR = 'wiki';

export interface WikiPage {
  path: string;
  title: string;
  content: string;
  lastUpdated: string;
  sourceRefs: string[];
}

export interface WikiIndex {
  pages: Array<{ path: string; title: string }>;
  lastUpdated: string;
}

export interface WikiLogEntry {
  timestamp: string;
  action: 'created' | 'updated' | 'compounded';
  sourceDocument: string;
  pagesAffected: string[];
}

export const WIKI_FOLDERS = [
  'sources',
  'entities',
  'concepts',
  'findings',
] as const;

export type WikiFolder = (typeof WIKI_FOLDERS)[number];

function makeWikiKey(wikiId: string, path: string): string {
  return `${WIKI_BASE_DIR}/${wikiId}/${path}`;
}

export async function writeWikiPage(
  path: string,
  content: string,
  wikiId: string = 'default'
): Promise<void> {
  if (path.includes('..') || path.startsWith('/')) {
    throw new Error(`Invalid wiki path: ${path}`);
  }
  const key = makeWikiKey(wikiId, path);
  await dbSet(key, content);
}

export async function readWikiPage(path: string, wikiId: string = 'default'): Promise<string | null> {
  const key = makeWikiKey(wikiId, path);
  const data = await dbGet(key);
  return data ?? null;
}

export async function deleteWikiPage(path: string, wikiId: string = 'default'): Promise<void> {
  const key = makeWikiKey(wikiId, path);
  await dbDelete(key);
}

export async function listWikiPages(wikiId: string = 'default'): Promise<string[]> {
  const prefix = `${WIKI_BASE_DIR}/${wikiId}/`;
  const keys = await dbKeys();
  return keys
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.replace(prefix, ''));
}

export async function listWikiFiles(wikiId: string = 'default'): Promise<Array<{ path: string; size: number }>> {
  const prefix = `${WIKI_BASE_DIR}/${wikiId}/`;
  const keys = await dbKeys();
  return keys
    .filter((k) => k.startsWith(prefix))
    .map((k) => {
      return { path: k.replace(prefix, ''), size: 0 };
    });
}

export async function clearWiki(wikiId: string = 'default'): Promise<void> {
  const prefix = `${WIKI_BASE_DIR}/${wikiId}/`;
  const keys = await dbKeys();
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      await dbDelete(key);
    }
  }
}

export async function buildWikiIndex(wikiId: string = 'default'): Promise<WikiIndex> {
  const pages = await listWikiPages(wikiId);
  const index: WikiIndex = {
    pages: pages.map((p) => ({ path: p, title: p })),
    lastUpdated: new Date().toISOString(),
  };
  return index;
}

/**
 * Read the first H1 heading from a wiki page as its title.
 */
export async function readWikiPageTitle(path: string, wikiId: string = 'default'): Promise<string> {
  const content = await readWikiPage(path, wikiId);
  if (!content) return path;
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : path;
}

/**
 * List wiki pages filtered by folder prefix.
 */
export async function listWikiPagesInFolder(folder: string, wikiId: string = 'default'): Promise<string[]> {
  const pages = await listWikiPages(wikiId);
  const prefix = folder.endsWith('/') ? folder : `${folder}/`;
  return pages.filter((p) => p.startsWith(prefix));
}

/**
 * Read all wiki pages as a map of path -> content.
 */
export async function readAllWikiPages(wikiId: string = 'default'): Promise<Record<string, string>> {
  const pages = await listWikiPages(wikiId);
  const result: Record<string, string> = {};
  for (const path of pages) {
    const content = await readWikiPage(path, wikiId);
    if (content !== null) {
      result[path] = content;
    }
  }
  return result;
}

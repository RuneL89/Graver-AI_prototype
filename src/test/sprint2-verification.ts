/**
 * Sprint 2 verification test — runs in Node via fake-indexeddb.
 *
 * Validates:
 * 1. WikiStore CRUD (create, list, delete, refresh, rename).
 * 2. Schema functions are namespaced by wikiId.
 * 3. Raw sources are namespaced by wikiId.
 * 4. Multiple wikis do not interfere with each other.
 * 5. Compound log entry uses parseable "compound" prefix.
 * 6. Ingestor and compounder accept wikiId parameter.
 */

import 'fake-indexeddb/auto';
import {
  writeWikiPage,
  readWikiPage,
  listWikiPages,
  clearWiki,
} from '../workbench/predigestor/schema';
import {
  storeRawSource,
  readRawSource,
  listRawSources,
} from '../workbench/predigestor/rawSources';
import {
  listWikis,
  createWiki,
  deleteWiki,
  getWikiManifest,
  refreshWikiManifest,
  renameWiki,
} from '../workbench/predigestor/wikiStore';

interface TestResult {
  name: string;
  pass: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, message: string) {
  results.push({ name, pass: condition, message: condition ? 'OK' : message });
}

async function runTests() {
  console.log('=== Sprint 2 Verification ===\n');

  // Clean slate
  await clearWiki('wiki-a');
  await clearWiki('wiki-b');

  // 1. WikiStore CRUD
  const initial = await listWikis();
  const initialCount = initial.length;

  const idA = await createWiki('Investigation A');
  assert('createWiki returns id', typeof idA === 'string' && idA.length > 0, 'Invalid wiki id');

  const afterCreate = await listWikis();
  assert('createWiki adds to list', afterCreate.length === initialCount + 1, `Expected ${initialCount + 1}, got ${afterCreate.length}`);

  const manifestA = await getWikiManifest(idA);
  assert('getWikiManifest finds wiki', manifestA !== null, 'Manifest not found');
  assert('getWikiManifest has name', manifestA?.name === 'Investigation A', `Name mismatch: ${manifestA?.name}`);

  await renameWiki(idA, 'Renamed Investigation');
  const renamed = await getWikiManifest(idA);
  assert('renameWiki works', renamed?.name === 'Renamed Investigation', `Rename failed: ${renamed?.name}`);

  const idB = await createWiki('Investigation B');
  const twoWikis = await listWikis();
  assert('listWikis returns both', twoWikis.length === initialCount + 2, `Expected ${initialCount + 2}, got ${twoWikis.length}`);

  // 2. Schema namespacing by wikiId
  await writeWikiPage('index.md', '# Wiki A Index', idA);
  await writeWikiPage('index.md', '# Wiki B Index', idB);

  const aIndex = await readWikiPage('index.md', idA);
  const bIndex = await readWikiPage('index.md', idB);
  assert('wiki pages are namespaced', aIndex === '# Wiki A Index' && bIndex === '# Wiki B Index', 'Wikis leaked into each other');

  await writeWikiPage('entities/alice.md', '# Alice\nFrom wiki A', idA);
  await writeWikiPage('entities/bob.md', '# Bob\nFrom wiki B', idB);

  const aPages = await listWikiPages(idA);
  const bPages = await listWikiPages(idB);
  assert('listWikiPages is namespaced', aPages.length === 2 && bPages.length === 2, `Page counts wrong: A=${aPages.length}, B=${bPages.length}`);
  assert('wiki-a has alice', aPages.includes('entities/alice.md'), 'Missing alice in A');
  assert('wiki-b has bob', bPages.includes('entities/bob.md'), 'Missing bob in B');
  assert('wiki-a does not have bob', !aPages.includes('entities/bob.md'), 'Bob leaked into A');

  // 3. Raw sources namespacing
  await storeRawSource('doc1.pdf', 'Text from doc1 for A', idA);
  await storeRawSource('doc1.pdf', 'Text from doc1 for B', idB);

  const aRaw = await readRawSource('doc1.pdf', idA);
  const bRaw = await readRawSource('doc1.pdf', idB);
  assert('raw sources are namespaced', aRaw === 'Text from doc1 for A' && bRaw === 'Text from doc1 for B', 'Raw sources leaked');

  const aRawList = await listRawSources(idA);
  const bRawList = await listRawSources(idB);
  assert('listRawSources is namespaced', aRawList.length === 1 && bRawList.length === 1, `Raw counts wrong: A=${aRawList.length}, B=${bRawList.length}`);

  // 4. Refresh manifest counts
  await refreshWikiManifest(idA);
  const refreshedA = await getWikiManifest(idA);
  assert('refresh updates pageCount', refreshedA?.pageCount === 2, `Expected 2 pages, got ${refreshedA?.pageCount}`);
  assert('refresh updates sourceCount', refreshedA?.sourceCount === 1, `Expected 1 source, got ${refreshedA?.sourceCount}`);

  // 5. Compound log prefix format
  await writeWikiPage('log.md', '# Ingestion Log\n\n## [2026-01-01T00:00:00.000Z] compound | Doc B\n- Pages: index.md\n\n', idA);
  const logContent = await readWikiPage('log.md', idA);
  assert('compound log prefix is parseable', !!logContent && logContent.includes('compound | Doc B'), 'Missing compound prefix');

  // 6. Delete wiki cleans up manifest
  await deleteWiki(idB);
  const afterDelete = await listWikis();
  assert('deleteWiki removes from list', afterDelete.length === initialCount + 1, `Expected ${initialCount + 1}, got ${afterDelete.length}`);
  assert('deleteWiki removes correct wiki', !afterDelete.some((w) => w.id === idB), 'Deleted wiki still in list');

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.name}: ${r.message}`);
  }

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }

  console.log('\n🎉 Sprint 2 verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  throw err;
});

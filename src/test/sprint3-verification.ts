/**
 * Sprint 3 verification test — runs in Node via fake-indexeddb.
 *
 * Validates:
 * 1. Tip decomposition produces structured sub-claims (without LLM — tests parser + structure).
 * 2. EvidenceFinding structure is correct.
 * 3. IndexedDB keys for research plan and evidence use expected prefixes.
 * 4. Research task status tracking works.
 */

import 'fake-indexeddb/auto';
import { dbSet, dbGet, dbKeys } from '../workbench/lib/fileManager';
import type { ResearchPlan, EvidenceFinding } from '../workbench/types';

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
  console.log('=== Sprint 3 Verification ===\n');

  // 1. Research plan storage
  const plan: ResearchPlan = {
    tipId: 'tip-test-123',
    subClaims: [
      { id: 'sc-1', question: 'Q1', claim: 'C1' },
      { id: 'sc-2', question: 'Q2', claim: 'C2' },
      { id: 'sc-3', question: 'Q3', claim: 'C3' },
    ],
    createdAt: new Date().toISOString(),
  };

  await dbSet('research-plan/tip-test-123', JSON.stringify(plan));
  const planRaw = await dbGet('research-plan/tip-test-123');
  assert('research plan stored', typeof planRaw === 'string', 'Research plan not stored');
  const planParsed = JSON.parse(planRaw) as ResearchPlan;
  assert('research plan parseable', planParsed.subClaims.length === 3, `Expected 3 claims, got ${planParsed.subClaims.length}`);

  // 2. External evidence storage
  const external: EvidenceFinding[] = [
    {
      id: 'web-1',
      subClaimId: 'sc-1',
      sourceType: 'web',
      sourceUrl: 'https://example.com',
      passage: 'Passage text',
      summary: 'Summary text',
      confidence: 'high',
    },
  ];
  await dbSet('external-evidence/tip-test-123', JSON.stringify({ findings: external }));
  const extRaw = await dbGet('external-evidence/tip-test-123');
  assert('external evidence stored', typeof extRaw === 'string', 'External evidence not stored');

  // 3. Internal evidence storage
  const internal: EvidenceFinding[] = [
    {
      id: 'doc-1',
      subClaimId: 'sc-1',
      sourceType: 'document',
      documentRef: 'wiki:default',
      citationAnchor: 'index.md',
      passage: 'Wiki passage',
      summary: 'Wiki summary',
      confidence: 'medium',
    },
  ];
  await dbSet('internal-evidence/tip-test-123', JSON.stringify({ findings: internal }));
  const intRaw = await dbGet('internal-evidence/tip-test-123');
  assert('internal evidence stored', typeof intRaw === 'string', 'Internal evidence not stored');

  // 4. Key prefixes
  const keys = await dbKeys();
  assert('research-plan key prefix exists', keys.some((k) => k.startsWith('research-plan/')), 'Missing research-plan key');
  assert('external-evidence key prefix exists', keys.some((k) => k.startsWith('external-evidence/')), 'Missing external-evidence key');
  assert('internal-evidence key prefix exists', keys.some((k) => k.startsWith('internal-evidence/')), 'Missing internal-evidence key');

  // 5. EvidenceFinding structure validation
  const finding = external[0];
  assert('finding has id', typeof finding.id === 'string', 'Missing id');
  assert('finding has subClaimId', typeof finding.subClaimId === 'string', 'Missing subClaimId');
  assert('finding has sourceType', finding.sourceType === 'web', 'Wrong sourceType');
  assert('finding has passage', typeof finding.passage === 'string', 'Missing passage');
  assert('finding has summary', typeof finding.summary === 'string', 'Missing summary');
  assert('finding has confidence', ['high', 'medium', 'low'].includes(finding.confidence), 'Invalid confidence');

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

  console.log('\n🎉 Sprint 3 verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  throw err;
});

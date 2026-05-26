/**
 * Sprint 5 verification test — runs in Node via fake-indexeddb.
 *
 * Validates:
 * 1. Session storage and retrieval.
 * 2. Pipeline stage tracking.
 * 3. Intermediate file listing.
 * 4. Report assembler builds markdown with expected sections.
 * 5. Evidence memo structure is correct.
 */

import 'fake-indexeddb/auto';
import { dbSet } from '../workbench/lib/fileManager';
import {
  createSession,
  saveSession,
  loadSession,
  updateSessionStage,
  listIntermediateFiles,
} from '../workbench/session';
import { buildEvidenceMemoMarkdown } from '../workbench/tiprouter/reportAssembler';
import type { ResearchPlan, Synthesis, EvidenceFinding } from '../workbench/types';

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
  console.log('=== Sprint 5 Verification ===\n');

  // 1. Session CRUD
  const session = createSession();
  assert('createSession has idle stage', session.stage === 'idle', `Stage: ${session.stage}`);
  assert('createSession has timestamps', !!session.createdAt && !!session.updatedAt, 'Missing timestamps');

  await saveSession(session);
  const loaded = await loadSession();
  assert('save/load session works', loaded !== null && loaded.stage === 'idle', 'Session not persisted');

  await updateSessionStage('researching', 'tip-123', 'wiki-abc');
  const updated = await loadSession();
  assert('updateSessionStage works', updated?.stage === 'researching', `Stage: ${updated?.stage}`);
  assert('updateSessionStage sets tipId', updated?.tipId === 'tip-123', `tipId: ${updated?.tipId}`);
  assert('updateSessionStage sets wikiId', updated?.wikiId === 'wiki-abc', `wikiId: ${updated?.wikiId}`);

  // 2. Intermediate file listing
  const plan: ResearchPlan = {
    tipId: 'tip-test-5',
    subClaims: [{ id: 'sc-1', question: 'Q1', claim: 'C1' }],
    createdAt: new Date().toISOString(),
  };
  await dbSet('research-plan/tip-test-5', JSON.stringify(plan));
  await dbSet('external-evidence/tip-test-5', JSON.stringify({ findings: [] }));

  const files = await listIntermediateFiles('tip-test-5');
  assert('lists intermediate files', files.length === 4, `Expected 4, got ${files.length}`);
  assert('research plan exists', files[0].exists, 'Research plan not found');
  assert('external evidence exists', files[1].exists, 'External evidence not found');
  assert('internal evidence missing', !files[2].exists, 'Internal evidence should be missing');

  // 3. Report assembler markdown
  const synthesis: Synthesis = {
    tipId: 'tip-test-5',
    entries: [
      {
        subClaimId: 'sc-1',
        supportingSources: [
          { sourceType: 'web', ref: 'https://example.com', passage: 'Passage one' },
          { sourceType: 'document', ref: 'wiki:default', passage: 'Passage two' },
        ],
        contradictions: [{ between: ['A', 'B'], description: 'They disagree' }],
        gaps: ['Need more data'],
      },
    ],
    createdAt: new Date().toISOString(),
  };

  const external: EvidenceFinding[] = [
    {
      id: 'f1',
      subClaimId: 'sc-1',
      sourceType: 'web',
      sourceUrl: 'https://example.com',
      passage: 'P1',
      summary: 'S1',
      confidence: 'high',
    },
  ];
  const internal: EvidenceFinding[] = [];

  const markdown = buildEvidenceMemoMarkdown(plan, synthesis, external, internal);
  assert('memo has title', markdown.includes('# Evidence Memo'), 'Missing title');
  assert('memo has research questions', markdown.includes('## Research Questions'), 'Missing research questions');
  assert('memo has findings', markdown.includes('## Findings by Sub-Claim'), 'Missing findings');
  assert('memo has contradictions', markdown.includes('[CONTRADICTION]'), 'Missing contradiction markers');
  assert('memo has gaps', markdown.includes('[GAP]'), 'Missing gap markers');
  assert('memo has source attribution', markdown.includes('## Source Attribution'), 'Missing attribution');
  assert('memo has confidence summary', markdown.includes('## Confidence Summary'), 'Missing confidence');
  assert('memo has disclaimer', markdown.includes('Human review is required'), 'Missing disclaimer');

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

  console.log('\n🎉 Sprint 5 verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  throw err;
});

/**
 * Sprint 4 verification test — runs in Node via fake-indexeddb.
 *
 * Validates:
 * 1. Mechanical validator catches missing sources.
 * 2. Mechanical validator catches single-source claims.
 * 3. Mechanical validator catches missing required fields.
 * 4. Mechanical audit builds correct EvidenceAudit structure.
 * 5. Synthesis persistence key prefix exists.
 */

import 'fake-indexeddb/auto';
import { dbSet, dbGet, dbKeys } from '../workbench/lib/fileManager';
import type { Synthesis } from '../workbench/types';
import { validateMechanically, buildMechanicalAudit } from '../workbench/tiprouter/mechanicalValidator';

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
  console.log('=== Sprint 4 Verification ===\n');

  // 1. Valid synthesis passes mechanical validation
  const validSynthesis: Synthesis = {
    tipId: 'tip-test',
    entries: [
      {
        subClaimId: 'sc-1',
        supportingSources: [
          { sourceType: 'web', ref: 'https://a.com', passage: 'P1' },
          { sourceType: 'document', ref: 'wiki:default', passage: 'P2' },
        ],
        contradictions: [],
        gaps: [],
      },
    ],
    createdAt: new Date().toISOString(),
  };

  const validResult = validateMechanically(validSynthesis);
  assert('valid synthesis passes', validResult.passed, `Expected pass, got issues: ${validResult.issues.join(', ')}`);

  // 2. Missing sources caught
  const noSources: Synthesis = {
    tipId: 'tip-test',
    entries: [
      {
        subClaimId: 'sc-1',
        supportingSources: [],
        contradictions: [],
        gaps: [],
      },
    ],
    createdAt: new Date().toISOString(),
  };
  const noSourcesResult = validateMechanically(noSources);
  assert('missing sources caught', !noSourcesResult.passed && noSourcesResult.issues.some((i) => i.includes('no supporting sources')), `Issues: ${noSourcesResult.issues.join(', ')}`);

  // 3. Single source caught
  const singleSource: Synthesis = {
    tipId: 'tip-test',
    entries: [
      {
        subClaimId: 'sc-1',
        supportingSources: [{ sourceType: 'web', ref: 'https://a.com', passage: 'P1' }],
        contradictions: [],
        gaps: [],
      },
    ],
    createdAt: new Date().toISOString(),
  };
  const singleResult = validateMechanically(singleSource);
  assert('single source caught', !singleResult.passed && singleResult.issues.some((i) => i.includes('single source')), `Issues: ${singleResult.issues.join(', ')}`);

  // 4. Missing required fields caught
  const missingFields: Synthesis = {
    tipId: 'tip-test',
    entries: [
      {
        subClaimId: 'sc-1',
        supportingSources: [
          { sourceType: 'web', ref: '', passage: '' },
          { sourceType: 'document', ref: 'wiki:default', passage: 'P2' },
        ],
        contradictions: [],
        gaps: [],
      },
    ],
    createdAt: new Date().toISOString(),
  };
  const missingResult = validateMechanically(missingFields);
  assert('missing fields caught', !missingResult.passed && missingResult.issues.some((i) => i.includes('missing')), `Issues: ${missingResult.issues.join(', ')}`);

  // 5. Mechanical audit structure
  const audit = buildMechanicalAudit(noSourcesResult);
  assert('audit has REJECTED status', audit.approval_status === 'REJECTED', `Status: ${audit.approval_status}`);
  assert('audit mechanical_pass false', audit.mechanical_pass === false, `mechanical_pass: ${audit.mechanical_pass}`);
  assert('audit has feedback', audit.has_feedback === true, `has_feedback: ${audit.has_feedback}`);
  assert('audit has rewriter_instructions', typeof audit.rewriter_instructions === 'string', 'Missing instructions');

  const approvedAudit = buildMechanicalAudit(validResult);
  assert('approved audit has APPROVED status', approvedAudit.approval_status === 'APPROVED', `Status: ${approvedAudit.approval_status}`);
  assert('approved audit mechanical_pass true', approvedAudit.mechanical_pass === true, `mechanical_pass: ${approvedAudit.mechanical_pass}`);

  // 6. Synthesis storage
  await dbSet('synthesis/tip-test', JSON.stringify(validSynthesis));
  const synthRaw = await dbGet('synthesis/tip-test');
  assert('synthesis stored', typeof synthRaw === 'string', 'Synthesis not stored');

  const keys = await dbKeys();
  assert('synthesis key prefix exists', keys.some((k) => k.startsWith('synthesis/')), 'Missing synthesis key');

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

  console.log('\n🎉 Sprint 4 verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  throw err;
});

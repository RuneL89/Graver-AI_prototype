/**
 * Sprint 6 verification test — runs in Node.
 *
 * Validates:
 * 1. Demo data files exist and are readable.
 * 2. Demo tip contains expected content.
 * 3. Demo document contains expected content.
 * 4. README includes demo guide references.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface TestResult {
  name: string;
  pass: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, message: string) {
  results.push({ name, pass: condition, message: condition ? 'OK' : message });
}

function runTests() {
  console.log('=== Sprint 6 Verification ===\n');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const demoDir = path.resolve(__dirname, '../../demo');
  const readmePath = path.resolve(__dirname, '../../README.md');

  // 1. Demo directory exists
  assert('demo directory exists', fs.existsSync(demoDir), 'demo/ directory missing');

  // 2. Sample tip exists
  const tipPath = path.join(demoDir, 'sample-tip.txt');
  assert('sample-tip.txt exists', fs.existsSync(tipPath), 'sample-tip.txt missing');

  if (fs.existsSync(tipPath)) {
    const tipContent = fs.readFileSync(tipPath, 'utf-8');
    assert('sample tip has content', tipContent.length > 100, 'Tip too short');
    assert('sample tip has donation amount', tipContent.includes('$25,000'), 'Missing donation amount');
    assert('sample tip has contract value', tipContent.includes('$2 million'), 'Missing contract value');
  }

  // 3. Sample document exists
  const docPath = path.join(demoDir, 'sample-document.md');
  assert('sample-document.md exists', fs.existsSync(docPath), 'sample-document.md missing');

  if (fs.existsSync(docPath)) {
    const docContent = fs.readFileSync(docPath, 'utf-8');
    assert('sample doc has content', docContent.length > 500, 'Document too short');
    assert('sample doc has timeline', docContent.includes('Timeline'), 'Missing timeline section');
    assert('sample doc has sources', docContent.includes('Sources'), 'Missing sources section');
  }

  // 4. README has demo references
  const readme = fs.readFileSync(readmePath, 'utf-8');
  assert('README mentions demo', readme.includes('Demo') || readme.includes('demo'), 'README missing demo references');
  assert('README has setup steps', readme.includes('npm install'), 'README missing setup steps');
  assert('README has verification commands', readme.includes('sprint1-verification'), 'README missing verification');

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

  console.log('\n🎉 Sprint 6 verification complete!');
}

runTests();

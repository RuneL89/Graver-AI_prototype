/**
 * Node.js test runner for the hello-world pipeline test.
 * Mocks IndexedDB with fake-indexeddb so the test can run outside a browser.
 */
import 'fake-indexeddb/auto';
import { runHelloWorldTest } from '../src/test/hello-world';

async function main() {
  console.log('Running hello-world pipeline test...\n');
  const result = await runHelloWorldTest();
  console.log(result.success ? '✅ PASS' : '❌ FAIL');
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

main();

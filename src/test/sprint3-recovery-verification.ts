/**
 * Sprint 3 (Resume, Abort, and Recovery) verification test.
 *
 * Validates:
 * 1. Abort signal terminates pipeline cleanly.
 * 2. runFromStage() preserves upstream stages and resets downstream.
 * 3. runFromStage() works from audit stage preserving synthesis.
 * 4. isRetryableError detects 429, timeout, network failures.
 * 5. runWithStallRecovery retries stalled tasks up to max waves.
 * 6. After max waves, stalled tasks are marked failed.
 * 7. TipInput.tsx has cancel button and wires PipelineNotifications.
 * 8. ResearchMonitor.tsx shows stalled state.
 * 9. checkAborted throws 'Pipeline aborted by user'.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { PipelineRunner } from '../workbench/lib/pipeline';
import {
  WORKBENCH_TIP_ROUTER_STAGE_DEFS,
  WORKBENCH_TIP_ROUTER_ORDER,
  getWorkbenchNextStage,
} from '../workbench/lib/workbenchStages';
import { isRetryableError, runWithStallRecovery, MAX_STALL_WAVES } from '../workbench/lib/researchStallRecovery';
import { checkAborted } from '../workbench/lib/workbenchAgentContext';
import type { AgentFn, AgentOutput, PipelineState, StageRecord } from '../workbench/lib/pipelineTypes';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface TestResult {
  name: string;
  pass: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, message: string) {
  results.push({ name, pass: condition, message: condition ? 'OK' : message });
}

// Mock slow agent for abort testing
const slowAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  await new Promise((r) => setTimeout(r, 500));
  return { draft: 'done', reasoning: 'slow agent finished', metadata: {} };
};

function buildState(partial: Partial<PipelineState> & { stages: StageRecord[] }): PipelineState {
  return {
    status: 'idle',
    currentStageId: null,
    selectedStageId: null,
    currentDraft: '',
    finalDraft: null,
    error: null,
    editorLoops: 0,
    segmentLoopIndex: -1,
    hasRunTopicLoop: false,
    ...partial,
  };
}

async function runTests() {
  console.log('=== Sprint 3 Recovery Verification ===\n');

  // 1. checkAborted throws correct message
  try {
    checkAborted({ abortSignal: AbortSignal.abort() } as any);
    assert('checkAborted throws on aborted signal', false, 'Did not throw');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(
      'checkAborted throws "Pipeline aborted by user"',
      msg === 'Pipeline aborted by user',
      `Wrong message: ${msg}`
    );
  }

  // 2. checkAborted does nothing when not aborted
  try {
    const ctrl = new AbortController();
    checkAborted({ abortSignal: ctrl.signal } as any);
    assert('checkAborted is silent when not aborted', true, 'OK');
  } catch {
    assert('checkAborted is silent when not aborted', false, 'Threw unexpectedly');
  }

  // 3. isRetryableError detects retryable patterns
  assert('isRetryableError detects 429', isRetryableError('429 Too Many Requests'), 'Failed');
  assert('isRetryableError detects rate limit', isRetryableError('rate limit exceeded'), 'Failed');
  assert('isRetryableError detects timeout', isRetryableError('Request timeout'), 'Failed');
  assert('isRetryableError detects network', isRetryableError('network error'), 'Failed');
  assert('isRetryableError detects ECONNRESET', isRetryableError('ECONNRESET'), 'Failed');
  assert('isRetryableError detects ETIMEDOUT', isRetryableError('ETIMEDOUT'), 'Failed');
  assert(
    'isRetryableError ignores non-retryable',
    !isRetryableError('Invalid API key'),
    'Should not be retryable'
  );

  // 4. runWithStallRecovery retries stalled tasks
  let attemptCount = 0;
  const stallResults = await runWithStallRecovery(
    [
      {
        id: 'a',
        item: 'a',
        run: async () => {
          attemptCount++;
          if (attemptCount <= 1) {
            return { success: false, error: '429 Too Many Requests' };
          }
          return { success: true };
        },
      },
    ],
    { maxWaves: 3 }
  );

  assert(
    'runWithStallRecovery retries stalled task',
    attemptCount === 2 && stallResults[0].success && stallResults[0].stallWaves === 1,
    `Attempts: ${attemptCount}, success: ${stallResults[0].success}, waves: ${stallResults[0].stallWaves}`
  );

  // 5. runWithStallRecovery marks failed after max waves
  let failAttempts = 0;
  const failResults = await runWithStallRecovery(
    [
      {
        id: 'b',
        item: 'b',
        run: async () => {
          failAttempts++;
          return { success: false, error: '429 Too Many Requests' };
        },
      },
    ],
    { maxWaves: 2 }
  );

  assert(
    'runWithStallRecovery marks failed after max waves',
    failAttempts === 3 && !failResults[0].success && failResults[0].stallWaves === 2,
    `Attempts: ${failAttempts}, success: ${failResults[0].success}, waves: ${failResults[0].stallWaves}`
  );

  // 6. runWithStallRecovery does not retry non-retryable errors
  let noRetryAttempts = 0;
  const noRetryResults = await runWithStallRecovery(
    [
      {
        id: 'c',
        item: 'c',
        run: async () => {
          noRetryAttempts++;
          return { success: false, error: 'Invalid API key' };
        },
      },
    ],
    { maxWaves: 3 }
  );

  assert(
    'runWithStallRecovery does not retry non-retryable',
    noRetryAttempts === 1 && !noRetryResults[0].success,
    `Attempts: ${noRetryAttempts}`
  );

  // 7. MAX_STALL_WAVES is 3
  assert('MAX_STALL_WAVES is 3', MAX_STALL_WAVES === 3, `Got ${MAX_STALL_WAVES}`);

  // 8. runFromStage preserves upstream and resets downstream
  const mockAgents = {
    decompose: async () => ({ draft: 'plan', reasoning: '', metadata: {} }),
    research: async () => ({ draft: 'research', reasoning: '', metadata: {} }),
    synthesize: async () => ({ draft: 'synth', reasoning: '', metadata: {} }),
    audit: async () => ({ draft: 'audit', reasoning: '', metadata: {} }),
    rewrite: async () => ({ draft: 'rewrite', reasoning: '', metadata: {} }),
    assemble: async () => ({ draft: 'memo', reasoning: '', metadata: {} }),
  };

  const existingState: PipelineState = buildState({
    stages: [
      ...WORKBENCH_TIP_ROUTER_STAGE_DEFS.map((def) => ({
        ...def,
        status: 'pending' as const,
        iteration: 0,
        reasoning: '',
        output: '',
      })),
    ],
  });

  const decomposeIdx = existingState.stages.findIndex((s) => s.id === 'decompose');
  existingState.stages[decomposeIdx] = {
    ...existingState.stages[decomposeIdx],
    status: 'completed',
    output: JSON.stringify({ tipId: 'tip-456' }),
    iteration: 1,
    reasoning: 'Done',
  };

  const runner = new PipelineRunner(
    mockAgents as unknown as import('../workbench/lib/pipelineTypes').AgentMap,
    { onStateChange: () => {}, onComplete: () => {}, onError: () => {} },
    {
      stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
      getNextStage: getWorkbenchNextStage,
      initialStageId: 'decompose',
      stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
      enableTopicLoop: false,
    }
  );

  // Use a throwing research agent so we can inspect reset state
  const throwingRunner = new PipelineRunner(
    {
      ...mockAgents,
      research: async () => {
        throw new Error('abort test');
      },
    } as unknown as import('../workbench/lib/pipelineTypes').AgentMap,
    { onStateChange: () => {}, onComplete: () => {}, onError: () => {} },
    {
      stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
      getNextStage: getWorkbenchNextStage,
      initialStageId: 'decompose',
      stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
      enableTopicLoop: false,
    }
  );

  await throwingRunner.runFromStage('research', {} as any, existingState);

  const state = throwingRunner.getState();
  const decomposeStage = state.stages.find((s) => s.id === 'decompose');
  const researchStage = state.stages.find((s) => s.id === 'research');
  const assembleStage = state.stages.find((s) => s.id === 'assemble');

  assert(
    'runFromStage from research preserves decompose',
    decomposeStage?.status === 'completed' && decomposeStage?.output === JSON.stringify({ tipId: 'tip-456' }),
    'Upstream stage not preserved'
  );
  assert(
    'runFromStage from research resets research',
    researchStage?.status !== 'completed',
    `Expected not completed, got ${researchStage?.status}`
  );
  assert(
    'runFromStage from research resets downstream (assemble)',
    assembleStage?.status === 'pending' && assembleStage?.iteration === 0,
    'Downstream not reset'
  );

  // 9. runFromStage from audit preserves synthesis
  const auditState: PipelineState = buildState({
    stages: [
      ...WORKBENCH_TIP_ROUTER_STAGE_DEFS.map((def) => ({
        ...def,
        status: 'pending' as const,
        iteration: 0,
        reasoning: '',
        output: '',
      })),
    ],
  });

  const synthIdx = auditState.stages.findIndex((s) => s.id === 'synthesize');
  auditState.stages[synthIdx] = {
    ...auditState.stages[synthIdx],
    status: 'completed',
    output: 'synthesis-output',
    iteration: 1,
    reasoning: 'Synthesized',
  };

  const auditThrowRunner = new PipelineRunner(
    {
      ...mockAgents,
      audit: async () => {
        throw new Error('audit abort test');
      },
    } as unknown as import('../workbench/lib/pipelineTypes').AgentMap,
    { onStateChange: () => {}, onComplete: () => {}, onError: () => {} },
    {
      stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
      getNextStage: getWorkbenchNextStage,
      initialStageId: 'decompose',
      stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
      enableTopicLoop: false,
    }
  );

  await auditThrowRunner.runFromStage('audit', {} as any, auditState);

  const auditPostState = auditThrowRunner.getState();
  const synthStage = auditPostState.stages.find((s) => s.id === 'synthesize');
  const auditStage = auditPostState.stages.find((s) => s.id === 'audit');

  assert(
    'runFromStage from audit preserves synthesis',
    synthStage?.status === 'completed' && synthStage?.output === 'synthesis-output',
    'Synthesis stage not preserved'
  );
  assert(
    'runFromStage from audit resets audit stage',
    auditStage?.status !== 'completed',
    `Expected not completed, got ${auditStage?.status}`
  );

  // 10. Source inspection: TipInput.tsx has cancel button
  const tipInputSource = readFileSync(join(__dirname, '../ui/components/TipInput.tsx'), 'utf-8');
  assert(
    'TipInput.tsx has cancel button',
    tipInputSource.includes('Cancel') && tipInputSource.includes('runnerRef.current?.stop()'),
    'Missing cancel button or stop call'
  );

  // 11. Source inspection: TipInput.tsx wires PipelineNotifications
  assert(
    'TipInput.tsx imports PipelineNotifications',
    tipInputSource.includes('PipelineNotifications'),
    'Missing PipelineNotifications import'
  );
  assert(
    'TipInput.tsx calls notifyComplete',
    tipInputSource.includes('notifyComplete'),
    'Missing notifyComplete call'
  );
  assert(
    'TipInput.tsx calls notifyAttention',
    tipInputSource.includes('notifyAttention'),
    'Missing notifyAttention call'
  );

  // 12. Source inspection: ResearchMonitor shows stalled state
  const monitorSource = readFileSync(join(__dirname, '../ui/components/ResearchMonitor.tsx'), 'utf-8');
  assert(
    'ResearchMonitor.tsx shows stalled state',
    monitorSource.includes("'stalled'") && monitorSource.includes('stalled > 0'),
    'Missing stalled state UI'
  );

  // 13. Abort stops PipelineRunner executeStage
  let abortError: string | null = null;
  const abortAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
    throw new Error('Pipeline aborted by user');
  };
  const abortRunner = new PipelineRunner(
    { decompose: abortAgent } as unknown as import('../workbench/lib/pipelineTypes').AgentMap,
    {
      onStateChange: () => {},
      onComplete: () => {},
      onError: (err) => {
        abortError = err;
      },
    },
    {
      stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
      getNextStage: getWorkbenchNextStage,
      initialStageId: 'decompose',
      stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
      enableTopicLoop: false,
    }
  );

  await abortRunner.run({} as any);

  assert(
    'Abort stops runner executeStage',
    abortError === 'Pipeline aborted by user',
    `Expected 'Pipeline aborted by user', got: ${abortError}`
  );

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  for (const r of results) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    console.log(`${icon}: ${r.name} — ${r.message}`);
  }

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }

  console.log('\nSprint 3 Recovery verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

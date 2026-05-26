/**
 * Sprint 2 (PipelineRunner Integration) verification test.
 *
 * Validates:
 * 1. PipelineRunner accepts configurable workbench stage definitions.
 * 2. Workbench stage definitions exist for all Tip Router and Pre-Digestor stages.
 * 3. AgentMap correctly maps stage IDs to AgentFn implementations.
 * 4. getWorkbenchNextStage routes audit → rewrite → audit loops based on metadata.
 * 5. runFromStage() works for workbench stages (resumes from research after decompose).
 * 6. TipInput.tsx, WikiQuery.tsx, WikiLint.tsx import and use PipelineRunner.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { PipelineRunner } from '../workbench/lib/pipeline';
import {
  WORKBENCH_TIP_ROUTER_STAGE_DEFS,
  WORKBENCH_PREDIGESTOR_STAGE_DEFS,
  WORKBENCH_TIP_ROUTER_ORDER,
  getWorkbenchNextStage,
} from '../workbench/lib/workbenchStages';
import {
  workbenchTipRouterAgentMap,
  workbenchPredigestorAgentMap,
} from '../workbench/lib/workbenchAgentMap';
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

// ---------------------------------------------------------------------------
// Mock agents for testing PipelineRunner without LLM calls
// ---------------------------------------------------------------------------

const mockDecomposeAgent: AgentFn = async (_ctx, onReasoningChunk, onUpdate) => {
  onReasoningChunk('Decomposing...');
  onUpdate?.({ output: 'plan-123' });
  return {
    draft: JSON.stringify({ tipId: 'tip-123', subClaims: [] }),
    reasoning: 'Decomposed into 3 sub-claims',
    metadata: { plan: { tipId: 'tip-123', subClaims: [] } },
  } satisfies AgentOutput;
};

const mockResearchAgent: AgentFn = async (_ctx, onReasoningChunk, onUpdate) => {
  onReasoningChunk('Researching...');
  onUpdate?.({ output: 'research results' });
  return {
    draft: 'research results',
    reasoning: 'Researched 3 sub-claims',
    metadata: { taskStatuses: [] },
  } satisfies AgentOutput;
};

const mockSynthesizeAgent: AgentFn = async (_ctx, onReasoningChunk) => {
  onReasoningChunk('Synthesizing...');
  return {
    draft: 'synthesis output',
    reasoning: 'Synthesized evidence',
    metadata: { synthesis: { entries: [] } },
  } satisfies AgentOutput;
};

const mockAuditAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  return {
    draft: 'audit output',
    reasoning: 'Audited synthesis',
    metadata: { audit: { approval_status: 'APPROVED', mechanical_pass: true, feedback: '' } },
  } satisfies AgentOutput;
};

const mockAuditRejectedAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  return {
    draft: 'audit output',
    reasoning: 'Audited synthesis',
    metadata: { audit: { approval_status: 'REJECTED', mechanical_pass: false, feedback: 'Fix sources', rewriter_instructions: 'Add more sources' } },
  } satisfies AgentOutput;
};

const mockRewriteAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  return {
    draft: 'rewritten synthesis',
    reasoning: 'Rewrote based on feedback',
    metadata: {},
  } satisfies AgentOutput;
};

const mockAssembleAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  return {
    draft: 'final memo',
    reasoning: 'Assembled evidence memo',
    metadata: { memo: { title: 'Memo' } },
  } satisfies AgentOutput;
};

const mockQueryAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  return {
    draft: 'answer',
    reasoning: 'Queried wiki',
    metadata: { answer: 'answer', pagesRead: ['index.md'] },
  } satisfies AgentOutput;
};

const mockLintAgent: AgentFn = async (_ctx, _onReasoningChunk, _onUpdate) => {
  return {
    draft: JSON.stringify({ issues: [] }),
    reasoning: 'Linted wiki',
    metadata: { issues: [] },
  } satisfies AgentOutput;
};

function buildMockAgentMap(): Record<string, AgentFn> {
  return {
    decompose: mockDecomposeAgent,
    research: mockResearchAgent,
    synthesize: mockSynthesizeAgent,
    audit: mockAuditAgent,
    rewrite: mockRewriteAgent,
    assemble: mockAssembleAgent,
    ingest: mockLintAgent,
    query: mockQueryAgent,
    lint: mockLintAgent,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  console.log('=== Sprint 2 Runner Verification ===\n');

  // 1. Workbench stage definitions exist
  const tipRouterIds = WORKBENCH_TIP_ROUTER_STAGE_DEFS.map((d) => d.id);
  const predigestorIds = WORKBENCH_PREDIGESTOR_STAGE_DEFS.map((d) => d.id);

  assert(
    'Tip Router stage defs exist',
    tipRouterIds.length === 6,
    `Expected 6, got ${tipRouterIds.length}`
  );
  assert(
    'Pre-Digestor stage defs exist',
    predigestorIds.length === 3,
    `Expected 3, got ${predigestorIds.length}`
  );
  assert(
    'Stage defs include decompose',
    tipRouterIds.includes('decompose'),
    'Missing decompose'
  );
  assert(
    'Stage defs include research',
    tipRouterIds.includes('research'),
    'Missing research'
  );
  assert(
    'Stage defs include synthesize',
    tipRouterIds.includes('synthesize'),
    'Missing synthesize'
  );
  assert(
    'Stage defs include audit',
    tipRouterIds.includes('audit'),
    'Missing audit'
  );
  assert(
    'Stage defs include rewrite',
    tipRouterIds.includes('rewrite'),
    'Missing rewrite'
  );
  assert(
    'Stage defs include assemble',
    tipRouterIds.includes('assemble'),
    'Missing assemble'
  );
  assert(
    'Stage defs include ingest',
    predigestorIds.includes('ingest'),
    'Missing ingest'
  );
  assert(
    'Stage defs include query',
    predigestorIds.includes('query'),
    'Missing query'
  );
  assert(
    'Stage defs include lint',
    predigestorIds.includes('lint'),
    'Missing lint'
  );

  // 2. AgentMap has required keys
  const tipRouterKeys = Object.keys(workbenchTipRouterAgentMap);
  const predigestorKeys = Object.keys(workbenchPredigestorAgentMap);

  assert(
    'Tip Router agent map has decompose',
    tipRouterKeys.includes('decompose'),
    'Missing decompose agent'
  );
  assert(
    'Tip Router agent map has research',
    tipRouterKeys.includes('research'),
    'Missing research agent'
  );
  assert(
    'Tip Router agent map has synthesize',
    tipRouterKeys.includes('synthesize'),
    'Missing synthesize agent'
  );
  assert(
    'Tip Router agent map has audit',
    tipRouterKeys.includes('audit'),
    'Missing audit agent'
  );
  assert(
    'Tip Router agent map has rewrite',
    tipRouterKeys.includes('rewrite'),
    'Missing rewrite agent'
  );
  assert(
    'Tip Router agent map has assemble',
    tipRouterKeys.includes('assemble'),
    'Missing assemble agent'
  );
  assert(
    'Pre-Digestor agent map has ingest',
    predigestorKeys.includes('ingest'),
    'Missing ingest agent'
  );
  assert(
    'Pre-Digestor agent map has query',
    predigestorKeys.includes('query'),
    'Missing query agent'
  );
  assert(
    'Pre-Digestor agent map has lint',
    predigestorKeys.includes('lint'),
    'Missing lint agent'
  );

  // Verify each agent is a function
  for (const [key, agent] of Object.entries(workbenchTipRouterAgentMap)) {
    assert(
      `Tip Router agent ${key} is a function`,
      typeof agent === 'function',
      `Agent ${key} is not a function`
    );
  }
  for (const [key, agent] of Object.entries(workbenchPredigestorAgentMap)) {
    assert(
      `Pre-Digestor agent ${key} is a function`,
      typeof agent === 'function',
      `Agent ${key} is not a function`
    );
  }

  // 3. getWorkbenchNextStage routing logic
  const approvedMeta = { audit: { approval_status: 'APPROVED' } };
  const rejectedMeta = { audit: { approval_status: 'REJECTED' } };
  const emptyState = buildState({ stages: [] });

  assert(
    'decompose → research',
    (await getWorkbenchNextStage('decompose', {}, '', emptyState)) === 'research',
    'Expected research'
  );
  assert(
    'research → synthesize',
    (await getWorkbenchNextStage('research', {}, '', emptyState)) === 'synthesize',
    'Expected synthesize'
  );
  assert(
    'synthesize → audit',
    (await getWorkbenchNextStage('synthesize', {}, '', emptyState)) === 'audit',
    'Expected audit'
  );
  assert(
    'audit APPROVED → assemble',
    (await getWorkbenchNextStage('audit', approvedMeta, '', emptyState)) === 'assemble',
    'Expected assemble'
  );
  assert(
    'audit REJECTED → rewrite',
    (await getWorkbenchNextStage('audit', rejectedMeta, '', emptyState)) === 'rewrite',
    'Expected rewrite'
  );
  assert(
    'rewrite → audit',
    (await getWorkbenchNextStage('rewrite', {}, '', emptyState)) === 'audit',
    'Expected audit'
  );
  assert(
    'assemble → COMPLETE',
    (await getWorkbenchNextStage('assemble', {}, '', emptyState)) === 'COMPLETE',
    'Expected COMPLETE'
  );
  assert(
    'ingest → COMPLETE',
    (await getWorkbenchNextStage('ingest', {}, '', emptyState)) === 'COMPLETE',
    'Expected COMPLETE'
  );
  assert(
    'query → COMPLETE',
    (await getWorkbenchNextStage('query', {}, '', emptyState)) === 'COMPLETE',
    'Expected COMPLETE'
  );
  assert(
    'lint → COMPLETE',
    (await getWorkbenchNextStage('lint', {}, '', emptyState)) === 'COMPLETE',
    'Expected COMPLETE'
  );

  // 4. PipelineRunner accepts configurable stage definitions
  const mockAgents = buildMockAgentMap();
  const runner = new PipelineRunner(
    mockAgents as unknown as import('../workbench/lib/pipelineTypes').AgentMap,
    {
      onStateChange: () => {},
      onComplete: () => {},
      onError: () => {},
    },
    {
      stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
      getNextStage: getWorkbenchNextStage,
      initialStageId: 'decompose',
      stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
      enableTopicLoop: false,
    }
  );

  const initialState = runner.getState();
  assert(
    'Runner state has workbench stages',
    initialState.stages.length === 6,
    `Expected 6 stages, got ${initialState.stages.length}`
  );
  assert(
    'Runner state has decompose stage',
    initialState.stages.some((s) => s.id === 'decompose'),
    'Missing decompose stage'
  );
  assert(
    'Runner state has assemble stage',
    initialState.stages.some((s) => s.id === 'assemble'),
    'Missing assemble stage'
  );

  // 5. executeStage works with workbench stages
  const decomposeResult = await runner.executeStage('decompose', {} as any, 'test tip', undefined);
  assert(
    'executeStage decompose returns AgentOutput',
    typeof decomposeResult.draft === 'string' && typeof decomposeResult.reasoning === 'string',
    'Invalid AgentOutput shape'
  );

  const postDecomposeState = runner.getState();
  const decomposeStage = postDecomposeState.stages.find((s) => s.id === 'decompose');
  assert(
    'executeStage updates stage status to completed',
    decomposeStage?.status === 'completed',
    `Expected completed, got ${decomposeStage?.status}`
  );
  assert(
    'executeStage updates stage output',
    decomposeStage?.output === decomposeResult.draft,
    'Stage output not set'
  );

  // 6. runFromStage() works for workbench stages
  // Simulate existing state where decompose is done and we want to resume from research
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

  // Mark decompose as completed with output
  const decomposeIdx = existingState.stages.findIndex((s) => s.id === 'decompose');
  if (decomposeIdx >= 0) {
    existingState.stages[decomposeIdx] = {
      ...existingState.stages[decomposeIdx],
      status: 'completed',
      output: JSON.stringify({ tipId: 'tip-456', subClaims: [{ id: 'sc1' }] }),
      iteration: 1,
      reasoning: 'Done',
    };
  }

  // Use a research agent that throws immediately so we can inspect reset state
  const throwingResearchAgent: AgentFn = async () => {
    throw new Error('Research agent throws for test');
  };
  const resetTestAgents = {
    ...mockAgents,
    research: throwingResearchAgent,
  };

  const researchRunner = new PipelineRunner(
    resetTestAgents as unknown as import('../workbench/lib/pipelineTypes').AgentMap,
    {
      onStateChange: () => {},
      onComplete: () => {},
      onError: () => {},
    },
    {
      stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
      getNextStage: getWorkbenchNextStage,
      initialStageId: 'decompose',
      stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
      enableTopicLoop: false,
    }
  );

  // runFromStage should reset research and downstream, preserve decompose
  await researchRunner.runFromStage('research', {} as any, existingState);

  const resumeState = researchRunner.getState();
  const resumedDecompose = resumeState.stages.find((s) => s.id === 'decompose');
  const resumedResearch = resumeState.stages.find((s) => s.id === 'research');
  const resumedAssemble = resumeState.stages.find((s) => s.id === 'assemble');

  assert(
    'runFromStage preserves upstream stage (decompose)',
    resumedDecompose?.status === 'completed' && resumedDecompose?.output === JSON.stringify({ tipId: 'tip-456', subClaims: [{ id: 'sc1' }] }),
    'Upstream stage was reset'
  );
  assert(
    'runFromStage resets starting stage (research)',
    resumedResearch?.status !== 'completed',
    `Expected not completed, got ${resumedResearch?.status}`
  );
  assert(
    'runFromStage resets downstream stages (assemble)',
    resumedAssemble?.status === 'pending' && resumedAssemble?.iteration === 0,
    'Downstream stage not reset'
  );

  // 7. Source inspection: TipInput.tsx uses PipelineRunner
  const tipInputSource = readFileSync(join(__dirname, '../ui/components/TipInput.tsx'), 'utf-8');
  assert(
    'TipInput.tsx imports PipelineRunner',
    tipInputSource.includes("import { PipelineRunner } from '../../workbench/lib/pipeline'"),
    'Missing PipelineRunner import'
  );
  assert(
    'TipInput.tsx imports workbenchAgentMap',
    tipInputSource.includes('workbenchTipRouterAgentMap'),
    'Missing workbenchTipRouterAgentMap import'
  );
  assert(
    'TipInput.tsx calls runner.run',
    tipInputSource.includes('runner.run('),
    'Missing runner.run call'
  );
  assert(
    'TipInput.tsx calls runner.runFromStage or runner.pause',
    tipInputSource.includes('runner.runFromStage(') || tipInputSource.includes('runner.pause') || tipInputSource.includes('runnerRef.current?.pause()'),
    'Missing runFromStage or pause call'
  );

  // 8. Source inspection: WikiQuery.tsx uses PipelineRunner
  const wikiQuerySource = readFileSync(join(__dirname, '../ui/components/WikiQuery.tsx'), 'utf-8');
  assert(
    'WikiQuery.tsx imports PipelineRunner',
    wikiQuerySource.includes("import { PipelineRunner } from '../../workbench/lib/pipeline'"),
    'Missing PipelineRunner import'
  );
  assert(
    'WikiQuery.tsx imports workbenchPredigestorAgentMap',
    wikiQuerySource.includes('workbenchPredigestorAgentMap'),
    'Missing workbenchPredigestorAgentMap import'
  );
  assert(
    'WikiQuery.tsx calls executeStage',
    wikiQuerySource.includes('runner.executeStage('),
    'Missing executeStage call'
  );

  // 9. Source inspection: WikiLint.tsx uses PipelineRunner
  const wikiLintSource = readFileSync(join(__dirname, '../ui/components/WikiLint.tsx'), 'utf-8');
  assert(
    'WikiLint.tsx imports PipelineRunner',
    wikiLintSource.includes("import { PipelineRunner } from '../../workbench/lib/pipeline'"),
    'Missing PipelineRunner import'
  );
  assert(
    'WikiLint.tsx imports workbenchPredigestorAgentMap',
    wikiLintSource.includes('workbenchPredigestorAgentMap'),
    'Missing workbenchPredigestorAgentMap import'
  );
  assert(
    'WikiLint.tsx calls executeStage',
    wikiLintSource.includes('runner.executeStage('),
    'Missing executeStage call'
  );

  // 10. synthesisLoop.ts deleted
  try {
    readFileSync(join(__dirname, '../workbench/tiprouter/synthesisLoop.ts'), 'utf-8');
    assert('synthesisLoop.ts deleted', false, 'File still exists');
  } catch {
    assert('synthesisLoop.ts deleted', true, 'OK');
  }

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

  console.log('\nSprint 2 Runner verification complete!');
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

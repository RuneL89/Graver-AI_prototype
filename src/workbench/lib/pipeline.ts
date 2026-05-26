import type {
  AgentMap,
  AgentContext,
  AgentOutput,
  AgentFn,
  PipelineState,
  PipelineCallbacks,
  StageId,
  StageRecord,
  StageStatus,
  TopicState,
  TopicStatus,
  AuditResult,
} from './pipelineTypes';
import { STAGE_DEFINITIONS } from './pipelineTypes';
import type { SessionConfig } from './sessionConfig';

import { PipelineService } from './pipelineService';
import { PipelineNotifications } from './pipelineNotifications';

const MAX_RETRIES = 3;
const MAX_TOPIC_ATTEMPTS = 5;

export type NextStageFn = (
  current: StageId,
  metadata: unknown,
  draft: string,
  state: PipelineState
) => Promise<StageId | 'COMPLETE'> | StageId | 'COMPLETE';

export type ContextBuilder<T> = (params: {
  sessionConfig: T;
  currentDraft: string;
  iteration: number;
  segmentLoopIndex: number;
  feedback?: unknown;
}) => AgentContext;

export interface PromptLogEntry {
  id: string;
  timestamp: string;
  stageId: StageId;
  agentName: string;
  prompt: string;
  response: string;
}

export interface PipelineRunnerOptions<T = SessionConfig> {
  /** Override default stage definitions. Falls back to newsroom stages if not provided. */
  stageDefinitions?: Omit<StageRecord, 'status' | 'iteration' | 'reasoning' | 'output' | 'metadata' | 'startedAt' | 'completedAt'>[];
  /** Override the default getNextStage logic. */
  getNextStage?: NextStageFn;
  /** Initial stage for run(). Defaults to 'articleResearch'. */
  initialStageId?: StageId;
  /** Stage order for runFromStage() reset logic. */
  stageOrder?: StageId[];
  /** Enable the parallel topic loop (newsroom only). */
  enableTopicLoop?: boolean;
  /** Custom context builder for passing extra fields to agents (e.g., workbench fields). */
  contextBuilder?: ContextBuilder<T>;
  /**
   * When true, `run()` uses `getRunFromInputs()` to determine the correct draft/feedback
   * for each next stage instead of blindly passing the previous stage's output.
   * Required for pipelines where stages read from shared state (e.g., workbench tip router).
   */
  useRunFromInputs?: boolean;
}

const INDEX_TO_SEGMENT: string[] = [
  'article1', 'article2', 'article3', 'article4', 'article5',
  'article6', 'article7', 'article8', 'editorial',
];

function getTopicLabel(index: number, sessionConfig: SessionConfig): string {
  const cfg = sessionConfig as any;
  const topics = cfg.content?.topics as string[] | undefined;
  const country = cfg.geography?.country as Record<string, string> | undefined;
  const continent = cfg.geography?.continent as Record<string, string> | undefined;
  switch (index) {
    case 0: return `${topics?.[0] ?? ''}, ${country?.name ?? ''}`;
    case 1: return `${topics?.[1] ?? ''}, ${country?.name ?? ''}`;
    case 2: return `${topics?.[2] ?? ''}, ${country?.name ?? ''}`;
    case 3: return 'Wildcard Local 1';
    case 4: return 'Wildcard Local 2';
    case 5: return `${topics?.[0] ?? ''}, ${continent?.name ?? ''}`;
    case 6: return `${topics?.[1] ?? ''}, ${continent?.name ?? ''}`;
    case 7: return `${topics?.[2] ?? ''}, ${continent?.name ?? ''}`;
    case 8: return 'Editorial';
    default: return `Topic ${index + 1}`;
  }
}

export class PipelineRunner<T = SessionConfig> {
  private state: PipelineState;
  private callbacks: PipelineCallbacks;
  private agents: AgentMap;
  private abortController: AbortController | null = null;
  private testMode: boolean = false;
  private paused: boolean = false;
  private promptLog: PromptLogEntry[] = [];

  private stageDefinitions: Omit<StageRecord, 'status' | 'iteration' | 'reasoning' | 'output' | 'metadata' | 'startedAt' | 'completedAt'>[];
  private getNextStageFn: NextStageFn;
  private initialStageId: StageId;
  private stageOrder: StageId[];
  private enableTopicLoop: boolean;
  private contextBuilder?: ContextBuilder<T>;
  private useRunFromInputs: boolean;

  constructor(
    agents: AgentMap,
    callbacks: PipelineCallbacks,
    options: PipelineRunnerOptions<T> = {}
  ) {
    this.agents = agents;
    this.callbacks = callbacks;
    this.stageDefinitions = options.stageDefinitions ?? STAGE_DEFINITIONS;
    this.getNextStageFn = options.getNextStage ?? this.defaultGetNextStage.bind(this);
    this.initialStageId = options.initialStageId ?? 'articleResearch';
    this.stageOrder = options.stageOrder ?? [
      'articleResearch', 'scriptWriter', 'fullScriptEditor', 'fullScriptWriter',
      'topicLoop', 'assembler', 'agent6',
    ];
    this.enableTopicLoop = options.enableTopicLoop ?? true;
    this.contextBuilder = options.contextBuilder;
    this.useRunFromInputs = options.useRunFromInputs ?? false;
    this.state = this.createInitialState();
  }

  private createInitialStages(): StageRecord[] {
    return this.stageDefinitions.map((def) => ({
      ...def,
      status: 'pending' as StageStatus,
      iteration: 0,
      reasoning: '',
      output: '',
    }));
  }

  private createInitialState(): PipelineState {
    return {
      status: 'idle',
      currentStageId: null,
      selectedStageId: null,
      stages: this.createInitialStages(),
      currentDraft: '',
      finalDraft: null,
      error: null,
      editorLoops: 0,
      segmentLoopIndex: -1,
      hasRunTopicLoop: false,
      topicLoop: undefined,
    };
  }

  private topicLoopUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  private updateState(partial: Partial<PipelineState>) {
    this.state = { ...this.state, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange() {
    if (this.state.topicLoop?.isActive) {
      if (!this.topicLoopUpdateTimer) {
        this.topicLoopUpdateTimer = setTimeout(() => {
          this.topicLoopUpdateTimer = null;
          this.callbacks.onStateChange(this.state);
          this.updateNotification();
        }, 50);
      }
    } else {
      this.callbacks.onStateChange(this.state);
      this.updateNotification();
    }
  }

  private flushTopicUpdates() {
    if (this.topicLoopUpdateTimer) {
      clearTimeout(this.topicLoopUpdateTimer);
      this.topicLoopUpdateTimer = null;
      this.callbacks.onStateChange(this.state);
      this.updateNotification();
    }
  }

  private updateNotification() {
    if (this.state.status !== 'running') return;
    const stage = this.state.currentStageId
      ? this.state.stages.find((s) => s.id === this.state.currentStageId)
      : null;
    const stageName = stage?.name ?? 'Starting...';
    const statusText = stage?.status === 'running'
      ? `${stageName} in progress...`
      : `Moving to ${stageName}...`;
    PipelineNotifications.update(statusText);
  }

  private updateStage(stageId: StageId, partial: Partial<StageRecord>) {
    const stages = this.state.stages.map((s) =>
      s.id === stageId ? { ...s, ...partial } : s
    );
    this.updateState({ stages });
  }

  async run(sessionConfig: T, testMode: boolean = false, initialDraft: string = '') {
    this.abortController = new AbortController();
    this.testMode = testMode;
    await PipelineNotifications.start('Starting pipeline...');
    await PipelineService.start();
    this.updateState({
      ...this.createInitialState(),
      status: 'running',
    });

    try {
      // sessionConfig is passed through to executeStage
      let stage: StageId = this.initialStageId;
      let draft = initialDraft;
      let feedback: unknown = undefined;

      while (true) {
        if (this.abortController.signal.aborted) {
          throw new Error('Pipeline aborted by user');
        }

        console.log(`[Pipeline] >>> Stage ${stage} starting — draft length: ${draft.length}`);

        const result = await this.executeStage(
          stage,
          sessionConfig,
          draft,
          feedback
        );

        draft = result.draft;
        feedback = result.metadata;

        const preview = result.draft.length > 200
          ? `${result.draft.slice(0, 100)} ... ${result.draft.slice(-100)}`
          : result.draft;
        console.log(`[Pipeline] <<< Stage ${stage} completed — output draft length: ${result.draft.length}`);
        console.log(`[Pipeline] Draft preview: ${preview}`);

        // Track current draft in state after each stage
        this.updateState({ currentDraft: draft });

        // Check pause flag between stages
        if (this.paused) {
          this.updateState({
            status: 'idle',
            currentStageId: stage,
          });
          await PipelineNotifications.stop();
          await PipelineService.stop();
          return;
        }

        // Determine next stage
        const next = await this.getNextStageFn(stage, result.metadata, draft, this.state);

        if (next === 'COMPLETE' || next === null) {
          this.updateState({
            status: 'complete',
            currentStageId: null,
            finalDraft: draft,
          });
          await PipelineNotifications.stop();
          await PipelineService.stop();
          this.callbacks.onComplete(draft);
          return;
        }

        // Use getRunFromInputs to determine correct inputs for the next stage
        // when the pipeline has non-linear input requirements (e.g., workbench).
        if (this.useRunFromInputs) {
          const inputs = this.getRunFromInputs(next, this.state.stages);
          console.log(`[Pipeline] useRunFromInputs for ${next}: draft length=${inputs.draft.length}, feedback=${inputs.feedback !== undefined}`);
          if (inputs.draft !== '' || inputs.feedback !== undefined) {
            draft = inputs.draft;
            feedback = inputs.feedback;
          }
        }

        stage = next;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateState({ status: 'error', error: message });
      await PipelineNotifications.stop();
      await PipelineService.stop();
      this.callbacks.onError(message);
    }
  }

  stop() {
    this.abortController?.abort();
    this.flushTopicUpdates();
    PipelineNotifications.stop();
    PipelineService.stop();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  getState(): PipelineState {
    return this.state;
  }

  getPromptLog(): PromptLogEntry[] {
    return this.promptLog;
  }

  async runFromStage(
    startStageId: StageId,
    sessionConfig: T,
    existingState: PipelineState,
    testMode: boolean = false
  ) {
    this.abortController = new AbortController();
    this.testMode = testMode;
    await PipelineNotifications.start('Starting pipeline...');
    await PipelineService.start();

    // Determine which stages to reset based on start position
    const startIdx = this.stageOrder.indexOf(startStageId);

    const stages = existingState.stages.map((s) => {
      const stageIdx = this.stageOrder.indexOf(s.id);
      if (stageIdx === -1) return s; // e.g. topicLoop is handled separately
      if (stageIdx < startIdx) return s; // Keep prior stages intact
      if (stageIdx === startIdx) {
        // Reset starting stage: clear outputs but keep iteration so executeStage increments it
        return {
          ...s,
          status: 'pending' as StageStatus,
          reasoning: '',
          output: '',
          metadata: undefined,
          startedAt: undefined,
          completedAt: undefined,
        };
      }
      // Reset subsequent stages fully
      return {
        ...s,
        status: 'pending' as StageStatus,
        iteration: 0,
        reasoning: '',
        output: '',
        metadata: undefined,
        startedAt: undefined,
        completedAt: undefined,
      };
    });

    // Determine topicLoop / hasRunTopicLoop state
    let hasRunTopicLoop = existingState.hasRunTopicLoop;
    let topicLoop = existingState.topicLoop;
    if (startStageId === 'topicLoop') {
      // Re-running topicLoop itself: reset it
      hasRunTopicLoop = false;
      topicLoop = undefined;
    } else if (startStageId === 'assembler' || startStageId === 'agent6') {
      // After topicLoop: keep existing topic loop results
      // hasRunTopicLoop stays true
    } else if (startStageId === 'fullScriptEditor' && hasRunTopicLoop) {
      // Re-running second-pass fullScriptEditor: keep topic loop results
    } else {
      // Re-running from before topicLoop: clear it
      hasRunTopicLoop = false;
      topicLoop = undefined;
    }

    this.state = {
      ...existingState,
      status: 'running',
      currentStageId: null,
      stages,
      error: null,
      finalDraft: null,
      hasRunTopicLoop,
      topicLoop,
    };

    try {
      // sessionConfig is passed through to executeStage
      const { draft: initialDraft, feedback: initialFeedback } = this.getRunFromInputs(
        startStageId,
        stages
      );
      let stage: StageId = startStageId;
      let draft = initialDraft;
      let feedback: unknown = initialFeedback;

      while (true) {
        if (this.abortController.signal.aborted) {
          throw new Error('Pipeline aborted by user');
        }

        console.log(`[Pipeline] >>> Stage ${stage} starting — draft length: ${draft.length}`);

        // topicLoop is not a regular agent stage; handle it specially
        if (stage === 'topicLoop' && this.enableTopicLoop) {
          await this.runParallelTopicLoop(sessionConfig, draft);
          this.updateState({ hasRunTopicLoop: true });
          stage = 'assembler';
          feedback = undefined;
          continue;
        }

        const result = await this.executeStage(stage, sessionConfig, draft, feedback);
        draft = result.draft;
        feedback = result.metadata;

        // Track current draft in state after each stage
        this.updateState({ currentDraft: draft });

        const preview = result.draft.length > 200
          ? `${result.draft.slice(0, 100)} ... ${result.draft.slice(-100)}`
          : result.draft;
        console.log(`[Pipeline] <<< Stage ${stage} completed — output draft length: ${result.draft.length}`);
        console.log(`[Pipeline] Draft preview: ${preview}`);

        // Check pause flag between stages
        if (this.paused) {
          this.updateState({
            status: 'idle',
            currentStageId: stage,
          });
          await PipelineNotifications.stop();
          await PipelineService.stop();
          return;
        }

        const next = await this.getNextStageFn(stage, result.metadata, draft, this.state);

        if (next === 'COMPLETE' || next === null) {
          this.updateState({
            status: 'complete',
            currentStageId: null,
            finalDraft: draft,
          });
          await PipelineNotifications.stop();
          await PipelineService.stop();
          this.callbacks.onComplete(draft);
          return;
        }

        stage = next;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateState({ status: 'error', error: message });
      await PipelineNotifications.stop();
      await PipelineService.stop();
      this.callbacks.onError(message);
    }
  }

  private getRunFromInputs(
    startStageId: StageId,
    stages: StageRecord[]
  ): { draft: string; feedback: unknown } {
    const findStage = (id: StageId) => stages.find((s) => s.id === id);

    // Workbench stages
    switch (startStageId) {
      case 'decompose':
        return { draft: '', feedback: undefined };
      case 'research': {
        const decompose = findStage('decompose');
        return { draft: decompose?.output ?? '', feedback: undefined };
      }
      case 'synthesize': {
        const decompose = findStage('decompose');
        try {
          const plan = JSON.parse(decompose?.output ?? '{}');
          return { draft: plan.tipId ?? '', feedback: undefined };
        } catch {
          return { draft: '', feedback: undefined };
        }
      }
      case 'audit': {
        const synthesize = findStage('synthesize');
        return { draft: synthesize?.output ?? '', feedback: undefined };
      }
      case 'rewrite': {
        const audit = findStage('audit');
        const synthesize = findStage('synthesize');
        return {
          draft: synthesize?.output ?? '',
          feedback: audit?.metadata,
        };
      }
      case 'assemble': {
        const decompose = findStage('decompose');
        try {
          const plan = JSON.parse(decompose?.output ?? '{}');
          return { draft: plan.tipId ?? '', feedback: undefined };
        } catch {
          return { draft: '', feedback: undefined };
        }
      }
      case 'ingest':
      case 'query':
      case 'lint':
        return { draft: '', feedback: undefined };
    }

    // Newsroom stages
    switch (startStageId) {
      case 'articleResearch':
        return { draft: '', feedback: undefined };

      case 'scriptWriter':
        return { draft: '', feedback: undefined };

      case 'fullScriptEditor': {
        const assembler = findStage('assembler');
        if (assembler?.status === 'completed') {
          return { draft: assembler.output, feedback: undefined };
        }
        const scriptWriter = findStage('scriptWriter');
        return { draft: scriptWriter?.output ?? '', feedback: undefined };
      }

      case 'fullScriptWriter': {
        const editor = findStage('fullScriptEditor');
        return { draft: editor?.output ?? '', feedback: editor?.metadata };
      }

      case 'topicLoop':
      case 'assembler': {
        const editor = findStage('fullScriptEditor');
        const writer = findStage('fullScriptWriter');
        if (editor?.status === 'completed') {
          return { draft: editor.output, feedback: undefined };
        }
        return { draft: writer?.output ?? '', feedback: undefined };
      }

      case 'agent6': {
        const editor = findStage('fullScriptEditor');
        return { draft: editor?.output ?? '', feedback: undefined };
      }

      default:
        return { draft: '', feedback: undefined };
    }
  }

  async executeStage(
    stageId: StageId,
    sessionConfig: T,
    currentDraft: string,
    feedback: unknown
  ): Promise<AgentOutput> {
    const agent = ((this.agents as unknown) as Record<string, AgentFn>)[stageId];
    if (!agent) {
      throw new Error(`No agent found for stage: ${stageId}`);
    }

    // Increment iteration
    const existingStage = this.state.stages.find((s) => s.id === stageId)!;
    const iteration = existingStage.iteration + 1;

    this.updateStage(stageId, {
      status: 'running',
      iteration,
      reasoning: '',
      output: '',
      prompt: undefined,
      metadata: undefined,
      startedAt: new Date().toISOString(),
    });
    this.updateState({ currentStageId: stageId });

    const ctx: AgentContext = this.contextBuilder
      ? this.contextBuilder({
          sessionConfig,
          currentDraft,
          iteration,
          segmentLoopIndex: this.state.segmentLoopIndex,
          feedback,
        })
      : {
          sessionConfig: sessionConfig as unknown as SessionConfig,
          currentDraft,
          iteration,
          segmentLoopIndex: this.state.segmentLoopIndex,
          feedback,
        };

    let retries = 0;
    while (true) {
      try {
        const reasoningChunks: string[] = [];

        const result = await agent(
          ctx,
          (chunk: string) => {
            if (this.abortController?.signal.aborted) {
              throw new Error('Pipeline aborted by user');
            }
            reasoningChunks.push(chunk);
            this.updateStage(stageId, {
              reasoning: reasoningChunks.join(''),
            });
          },
          (partial: Partial<StageRecord>) => {
            if (this.abortController?.signal.aborted) {
              throw new Error('Pipeline aborted by user');
            }
            this.updateStage(stageId, partial);
          }
        );

        const status = this.inferStatus(stageId, result.metadata);

        this.updateStage(stageId, {
          status,
          output: result.draft,
          prompt: result.prompt,
          metadata: result.metadata,
          completedAt: new Date().toISOString(),
        });

        // Log prompt and response
        if (result.prompt) {
          const stageDef = this.stageDefinitions.find((d) => d.id === stageId);
          this.promptLog.push({
            id: `${stageId}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            stageId,
            agentName: stageDef?.name || stageId,
            prompt: result.prompt,
            response: result.draft,
          });
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Don't retry on user abort
        if (message === 'Pipeline aborted by user') {
          this.updateStage(stageId, {
            status: 'error',
            output: 'Aborted by user',
            completedAt: new Date().toISOString(),
          });
          throw err;
        }
        retries++;
        if (retries >= MAX_RETRIES) {
          this.updateStage(stageId, {
            status: 'error',
            output: `Failed after ${MAX_RETRIES} attempts: ${message}`,
            completedAt: new Date().toISOString(),
          });
          throw err;
        }
        // Wait before retry
        await new Promise((r) => setTimeout(r, 1000 * retries));
      }
    }
  }

  private inferStatus(stageId: StageId, metadata: unknown): StageStatus {
    if (!metadata || typeof metadata !== 'object') return 'completed';

    const m = metadata as Record<string, unknown>;

    if (stageId === 'fullScriptEditor' || stageId === 'segmentEditor') {
      const status = m.approval_status;
      if (status === 'REJECTED') return 'rejected';
      return 'completed';
    }

    return 'completed';
  }

  private defaultGetNextStage(
    current: StageId,
    metadata: unknown,
    _draft: string
  ): Promise<StageId | 'COMPLETE'> | StageId | 'COMPLETE' {
    if (!metadata || typeof metadata !== 'object') {
      // Fallback: linear flow
      const flow: StageId[] = [
        'articleResearch', 'scriptWriter', 'fullScriptEditor', 'fullScriptWriter',
        'topicLoop', 'assembler', 'fullScriptEditor', 'agent6',
      ];
      const idx = flow.indexOf(current);
      if (idx === -1 || idx === flow.length - 1) return 'COMPLETE';
      return flow[idx + 1];
    }

    const m = metadata as Record<string, unknown>;

    switch (current) {
      case 'articleResearch': {
        return 'scriptWriter';
      }

      case 'scriptWriter': {
        if (this.testMode) {
          return 'agent6';
        }
        return 'fullScriptEditor';
      }

      case 'fullScriptEditor': {
        if (m.approval_status === 'REJECTED') {
          this.updateState({
            editorLoops: this.state.editorLoops + 1,
          });
          return 'fullScriptWriter';
        }
        if (!this.state.hasRunTopicLoop && this.enableTopicLoop) {
          return 'topicLoop';
        }
        return 'agent6';
      }

      case 'fullScriptWriter':
        return 'fullScriptEditor';

      case 'topicLoop': {
        this.updateState({ hasRunTopicLoop: true });
        return 'assembler';
      }

      case 'assembler': {
        this.updateState({ segmentLoopIndex: -1, hasRunTopicLoop: true });
        return 'fullScriptEditor';
      }

      case 'agent6':
        return 'COMPLETE';

      default:
        return 'COMPLETE';
    }
  }

  // ========================================================================
  // PARALLEL TOPIC LOOP
  // ========================================================================

  private async runParallelTopicLoop(
    sessionConfig: T,
    currentDraft: string
  ): Promise<void> {
    const totalTopics = (sessionConfig as any).editorial?.includeSegment ? 9 : 8;
    const topics: TopicStatus[] = Array.from({ length: totalTopics }, (_, i) => ({
      index: i,
      segmentId: INDEX_TO_SEGMENT[i],
      label: getTopicLabel(i, sessionConfig as unknown as SessionConfig),
      state: 'pending' as TopicState,
      attempt: 0,
      reasoning: '',
      output: '',
    }));

    this.updateStage('topicLoop', {
      status: 'running',
      iteration: 1,
      reasoning: '',
      output: '',
      startedAt: new Date().toISOString(),
    });
    this.updateState({
      currentStageId: 'topicLoop',
      topicLoop: {
        isActive: true,
        topics,
        approvedCount: 0,
        totalCount: totalTopics,
        waveNumber: 0,
      },
    });

    // Phase 1: Eager launch all topics
    const workers = topics.map((t) => this.runTopicWorker(t.index, sessionConfig, currentDraft));
    await Promise.allSettled(workers);

    // Phase 2: Round-based retry for stalled topics
    let wave = 0;
    while (this.hasStalledTopics()) {
      wave++;
      this.updateTopicLoopWave(wave);
      const stalled = this.getStalledTopicIndices();
      this.clearStalledTopics();
      const retries = stalled.map((i) => this.runTopicWorker(i, sessionConfig, currentDraft));
      await Promise.allSettled(retries);
    }

    // Mark complete
    this.updateStage('topicLoop', {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    this.updateState({ topicLoop: { ...this.state.topicLoop!, isActive: false } });
    this.flushTopicUpdates();
  }

  private async runTopicWorker(
    topicIndex: number,
    sessionConfig: T,
    currentDraft: string
  ): Promise<void> {
    while (true) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Pipeline aborted by user');
      }

      const topic = this.state.topicLoop!.topics[topicIndex];
      if (topic.attempt >= MAX_TOPIC_ATTEMPTS) {
        throw new Error(`Topic ${topic.segmentId} exceeded max attempts (${MAX_TOPIC_ATTEMPTS})`);
      }

      // --- EDITOR ---
      this.updateTopicStatus(topicIndex, {
        state: 'editing',
        startedAt: new Date().toISOString(),
      });

      try {
        const editorResult = await this.executeTopicAgent(
          'segmentEditor',
          topicIndex,
          sessionConfig,
          currentDraft
        );

        const audit = editorResult.metadata as AuditResult | undefined;

        if (audit?.approval_status === 'APPROVED') {
          this.updateTopicStatus(topicIndex, {
            state: 'approved',
            output: editorResult.draft,
            metadata: audit,
            completedAt: new Date().toISOString(),
          });
          return; // Done!
        }

        // REJECTED — eager writer
        this.updateTopicStatus(topicIndex, {
          state: 'rejected',
          output: editorResult.draft,
          metadata: audit,
        });
      } catch (err) {
        if (this.isRetryableError(err)) {
          this.updateTopicStatus(topicIndex, {
            state: 'stalled',
            lastError: err instanceof Error ? err.message : String(err),
          });
          return; // Exit worker, round-based retry will pick it up
        }
        throw err; // Fatal error
      }

      // --- WRITER ---
      this.updateTopicStatus(topicIndex, {
        state: 'rewriting',
        attempt: topic.attempt + 1,
        startedAt: new Date().toISOString(),
      });

      try {
        const feedback = this.state.topicLoop!.topics[topicIndex].metadata;
        const writerResult = await this.executeTopicAgent(
          'segmentWriter',
          topicIndex,
          sessionConfig,
          currentDraft,
          feedback
        );

        this.updateTopicStatus(topicIndex, {
          output: writerResult.draft,
          metadata: writerResult.metadata,
        });
        // Loop back immediately for re-audit (eager)
      } catch (err) {
        if (this.isRetryableError(err)) {
          this.updateTopicStatus(topicIndex, {
            state: 'stalled',
            lastError: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        throw err;
      }
    }
  }

  private async executeTopicAgent(
    stageId: 'segmentEditor' | 'segmentWriter',
    topicIndex: number,
    sessionConfig: T,
    currentDraft: string,
    feedback?: unknown
  ): Promise<AgentOutput> {
    const agent = this.agents[stageId];
    const topic = this.state.topicLoop!.topics[topicIndex];

    const ctx: AgentContext = this.contextBuilder
      ? this.contextBuilder({
          sessionConfig,
          currentDraft,
          iteration: topic.attempt + 1,
          segmentLoopIndex: topicIndex,
          feedback,
        })
      : {
          sessionConfig: sessionConfig as unknown as SessionConfig,
          currentDraft,
          iteration: topic.attempt + 1,
          segmentLoopIndex: topicIndex,
          feedback,
        };

    let retries = 0;
    while (true) {
      try {
        const reasoningChunks: string[] = [];
        const result = await agent(
          ctx,
          (chunk) => {
            if (this.abortController?.signal.aborted) {
              throw new Error('Pipeline aborted by user');
            }
            reasoningChunks.push(chunk);
            this.updateTopicStatus(topicIndex, { reasoning: reasoningChunks.join('') });
          },
          (partial) => {
            if (this.abortController?.signal.aborted) {
              throw new Error('Pipeline aborted by user');
            }
            this.updateTopicStatus(topicIndex, {
              prompt: partial.prompt,
              output: partial.output ?? topic.output,
            });
          }
        );
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'Pipeline aborted by user') throw err;
        retries++;
        if (retries >= MAX_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 1000 * retries));
      }
    }
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  private isRetryableError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /429|rate.limit|timeout|network|econnreset|etimedout/i.test(msg);
  }

  private hasStalledTopics(): boolean {
    return this.state.topicLoop!.topics.some((t) => t.state === 'stalled');
  }

  private getStalledTopicIndices(): number[] {
    return this.state.topicLoop!.topics
      .map((t, i) => (t.state === 'stalled' ? i : -1))
      .filter((i) => i !== -1);
  }

  private clearStalledTopics(): void {
    const topics = this.state.topicLoop!.topics.map((t) =>
      t.state === 'stalled' ? { ...t, state: 'pending' as TopicState } : t
    );
    this.updateState({ topicLoop: { ...this.state.topicLoop!, topics } });
  }

  private updateTopicStatus(index: number, partial: Partial<TopicStatus>): void {
    const tl = this.state.topicLoop!;
    const topics = [...tl.topics];
    topics[index] = { ...topics[index], ...partial };
    const approvedCount = topics.filter((t) => t.state === 'approved').length;
    this.updateState({
      topicLoop: { ...tl, topics, approvedCount },
    });
  }

  private updateTopicLoopWave(wave: number): void {
    this.updateState({
      topicLoop: { ...this.state.topicLoop!, waveNumber: wave },
    });
  }
}

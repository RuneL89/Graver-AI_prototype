/**
 * WorkbenchAgentContext extends the standard AgentContext with workbench-specific fields.
 *
 * The `sessionConfig` field is preserved with the standard SessionConfig type to maintain
 * compatibility with PipelineRunner, while workbench agents use `apiConfig`, `braveApiKey`,
 * and other fields directly.
 */

import type { AgentContext, StageRecord, AgentOutput } from './pipelineTypes';
import type { SessionConfig } from './sessionConfig';
import type { ApiConfig } from '../types-shared';
import type { WorkbenchSessionConfig } from '../types';

export interface WorkbenchAgentContext extends AgentContext {
  /** API configuration for LLM calls */
  apiConfig: ApiConfig;
  /** Brave Search API key */
  braveApiKey: string;
  /** Brave Search CORS proxy URL */
  braveProxyUrl: string;
  /** Tip ID for tip-router agents */
  tipId?: string;
  /** Wiki ID for predigestor agents */
  wikiId?: string | null;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Build a WorkbenchAgentContext from a workbench session config and optional overrides.
 */
export function buildWorkbenchAgentContext(
  params: {
    sessionConfig: SessionConfig;
    apiConfig: ApiConfig;
    braveApiKey?: string;
    braveProxyUrl?: string;
    currentDraft?: string;
    iteration?: number;
    segmentLoopIndex?: number;
    feedback?: unknown;
    tipId?: string;
    wikiId?: string | null;
    abortSignal?: AbortSignal;
  }
): WorkbenchAgentContext {
  return {
    sessionConfig: params.sessionConfig,
    currentDraft: params.currentDraft ?? '',
    iteration: params.iteration ?? 0,
    segmentLoopIndex: params.segmentLoopIndex ?? 0,
    feedback: params.feedback,
    apiConfig: params.apiConfig,
    braveApiKey: params.braveApiKey ?? '',
    braveProxyUrl: params.braveProxyUrl ?? '',
    tipId: params.tipId,
    wikiId: params.wikiId,
    abortSignal: params.abortSignal,
  };
}

/**
 * Emit a reasoning chunk through both onReasoningChunk and onUpdate.
 */
export function emitReasoning(
  chunk: string,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): void {
  onReasoningChunk(chunk);
  onUpdate?.({ reasoning: chunk });
}

/**
 * Check if the abort signal has been triggered.
 */
export function isAborted(ctx: WorkbenchAgentContext): boolean {
  return ctx.abortSignal?.aborted ?? false;
}

/**
 * Throw if aborted, so agents can bail out early.
 */
export function checkAborted(ctx: WorkbenchAgentContext): void {
  if (isAborted(ctx)) {
    throw new Error('Pipeline aborted by user');
  }
}

/**
 * Helper to build a standard AgentOutput from agent results.
 */
export function buildAgentOutput(params: {
  draft: string;
  reasoning: string;
  metadata?: unknown;
  prompt?: string;
}): AgentOutput {
  return {
    draft: params.draft,
    reasoning: params.reasoning,
    metadata: params.metadata,
    prompt: params.prompt,
  };
}

/**
 * Create a ContextBuilder for PipelineRunner that produces WorkbenchAgentContext.
 *
 * Usage:
 *   const runner = new PipelineRunner(agents, callbacks, {
 *     contextBuilder: createWorkbenchContextBuilder(sessionConfig, wikiId),
 *   });
 */
export function createWorkbenchContextBuilder(
  workbenchConfig: WorkbenchSessionConfig,
  wikiId: string | null
) {
  return (params: {
    sessionConfig: unknown;
    currentDraft: string;
    iteration: number;
    segmentLoopIndex: number;
    feedback?: unknown;
  }): WorkbenchAgentContext => {
    return {
      sessionConfig: params.sessionConfig as SessionConfig,
      currentDraft: params.currentDraft,
      iteration: params.iteration,
      segmentLoopIndex: params.segmentLoopIndex,
      feedback: params.feedback,
      apiConfig: workbenchConfig.apiConfig,
      braveApiKey: workbenchConfig.braveApiKey,
      braveProxyUrl: workbenchConfig.braveProxyUrl,
      wikiId,
    };
  };
}

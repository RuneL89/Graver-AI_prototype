import type { ApiConfig } from '../types-shared';
import type { ResearchPlan, EvidenceFinding } from '../types';
import { researchSubClaimWeb, saveExternalEvidence } from './webResearcher';
import { researchSubClaimWiki, saveInternalEvidence } from './wikiQuerier';
import type { AgentOutput, StageRecord } from '../lib/pipelineTypes';
import type { WorkbenchAgentContext } from '../lib/workbenchAgentContext';
import { checkAborted, emitReasoning, buildAgentOutput } from '../lib/workbenchAgentContext';
import { isRetryableError, MAX_STALL_WAVES } from '../lib/researchStallRecovery';

export interface ResearchTaskStatus {
  subClaimId: string;
  subClaimQuestion: string;
  state: 'pending' | 'running' | 'completed' | 'stalled' | 'failed';
  webFindingsCount: number;
  wikiFindingsCount: number;
  error?: string;
}

export interface ResearchLoopCallbacks {
  onTaskUpdate?: (status: ResearchTaskStatus) => void;
  onReasoningChunk?: (chunk: string) => void;
}

export interface ResearchLoopResult {
  success: boolean;
  externalFindings: EvidenceFinding[];
  internalFindings: EvidenceFinding[];
  taskStatuses: ResearchTaskStatus[];
  error?: string;
}

/**
 * Run parallel research for all sub-claims in a research plan.
 * Implements round-based stall recovery: stalled sub-claims retry together
 * after the initial wave completes. Max 3 retry waves.
 */
export async function runParallelResearch(
  plan: ResearchPlan,
  apiConfig: ApiConfig,
  braveApiKey: string,
  braveProxyUrl: string,
  wikiId: string | null,
  callbacks?: ResearchLoopCallbacks
): Promise<ResearchLoopResult> {
  const externalFindings: EvidenceFinding[] = [];
  const internalFindings: EvidenceFinding[] = [];
  const taskStatuses: ResearchTaskStatus[] = plan.subClaims.map((sc) => ({
    subClaimId: sc.id,
    subClaimQuestion: sc.question,
    state: 'pending',
    webFindingsCount: 0,
    wikiFindingsCount: 0,
  }));

  // Accumulate findings per sub-claim across retry waves
  const subClaimFindings = new Map<string, { external: EvidenceFinding[]; internal: EvidenceFinding[] }>();

  function updateStatus(subClaimId: string, partial: Partial<ResearchTaskStatus>) {
    const idx = taskStatuses.findIndex((t) => t.subClaimId === subClaimId);
    if (idx !== -1) {
      taskStatuses[idx] = { ...taskStatuses[idx], ...partial };
      callbacks?.onTaskUpdate?.(taskStatuses[idx]);
    }
  }

  async function runSubClaim(subClaim: typeof plan.subClaims[0]): Promise<{ completed: boolean; retryableError?: string }> {
    updateStatus(subClaim.id, { state: 'running' });

    const [webResult, wikiResult] = await Promise.allSettled([
      researchSubClaimWeb(subClaim, apiConfig, braveApiKey, braveProxyUrl, {
        onReasoningChunk: (chunk) => {
          callbacks?.onReasoningChunk?.(chunk);
        },
      }),
      researchSubClaimWiki(subClaim, apiConfig, wikiId, {
        onReasoningChunk: (chunk) => {
          callbacks?.onReasoningChunk?.(chunk);
        },
      }),
    ]);

    let webFindings: EvidenceFinding[] = [];
    let wikiFindings: EvidenceFinding[] = [];
    let retryableError: string | undefined;

    if (webResult.status === 'fulfilled') {
      if (webResult.value.success) {
        webFindings = webResult.value.findings;
      } else if (isRetryableError(webResult.value.error || '')) {
        retryableError = webResult.value.error;
      }
    } else {
      const err = webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason);
      if (isRetryableError(err)) retryableError = err;
    }

    if (wikiResult.status === 'fulfilled') {
      if (wikiResult.value.success) {
        wikiFindings = wikiResult.value.findings;
      } else if (!retryableError && isRetryableError(wikiResult.value.error || '')) {
        retryableError = wikiResult.value.error;
      }
    } else {
      const err = wikiResult.reason instanceof Error ? wikiResult.reason.message : String(wikiResult.reason);
      if (!retryableError && isRetryableError(err)) retryableError = err;
    }

    // Accumulate findings across waves
    const existing = subClaimFindings.get(subClaim.id) || { external: [], internal: [] };
    existing.external.push(...webFindings);
    existing.internal.push(...wikiFindings);
    subClaimFindings.set(subClaim.id, existing);

    if (retryableError) {
      updateStatus(subClaim.id, { state: 'stalled', error: retryableError });
      return { completed: false, retryableError };
    }

    updateStatus(subClaim.id, {
      state: 'completed',
      webFindingsCount: existing.external.length,
      wikiFindingsCount: existing.internal.length,
      error: undefined,
    });
    return { completed: true };
  }

  try {
    callbacks?.onReasoningChunk?.(`[ResearchLoop] Launching parallel research for ${plan.subClaims.length} sub-claims...`);

    let pendingSubClaims = [...plan.subClaims];
    let wave = 0;

    while (pendingSubClaims.length > 0 && wave <= MAX_STALL_WAVES) {
      if (wave > 0) {
        callbacks?.onReasoningChunk?.(`[ResearchLoop] Retry wave ${wave} for ${pendingSubClaims.length} stalled sub-claim(s)...`);
      }

      const results = await Promise.allSettled(pendingSubClaims.map((sc) => runSubClaim(sc)));

      const stalled: typeof plan.subClaims = [];
      for (let i = 0; i < pendingSubClaims.length; i++) {
        const result = results[i];
        const subClaim = pendingSubClaims[i];
        if (result.status === 'rejected') {
          const err = result.reason instanceof Error ? result.reason.message : String(result.reason);
          if (isRetryableError(err)) {
            stalled.push(subClaim);
            updateStatus(subClaim.id, { state: 'stalled', error: err });
          } else {
            updateStatus(subClaim.id, { state: 'failed', error: err });
          }
        } else if (!result.value.completed) {
          stalled.push(subClaim);
        }
      }

      pendingSubClaims = stalled;
      wave++;
    }

    // Mark remaining stalled as failed after max waves
    for (const sc of pendingSubClaims) {
      const status = taskStatuses.find((t) => t.subClaimId === sc.id);
      updateStatus(sc.id, {
        state: 'failed',
        error: status?.error || 'Max retry waves exceeded',
      });
    }

    // Flatten findings
    for (const findings of subClaimFindings.values()) {
      externalFindings.push(...findings.external);
      internalFindings.push(...findings.internal);
    }

    // Persist evidence
    await saveExternalEvidence(plan.tipId, externalFindings);
    await saveInternalEvidence(plan.tipId, internalFindings);

    callbacks?.onReasoningChunk?.(
      `[ResearchLoop] Complete. ${externalFindings.length} web findings, ${internalFindings.length} wiki findings.`
    );

    return {
      success: true,
      externalFindings,
      internalFindings,
      taskStatuses,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[ResearchLoop] Error: ${error}`);
    return {
      success: false,
      externalFindings,
      internalFindings,
      taskStatuses,
      error,
    };
  }
}

/**
 * AgentFn implementation of the parallel research loop.
 * Receives a ResearchPlan JSON via `ctx.currentDraft`.
 */
export async function researchLoopAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  checkAborted(ctx);
  const plan: ResearchPlan = JSON.parse(ctx.currentDraft);
  const apiConfig = ctx.apiConfig;
  const braveApiKey = ctx.braveApiKey;
  const braveProxyUrl = ctx.braveProxyUrl;
  const wikiId = ctx.wikiId ?? null;

  emitReasoning(
    `[ResearchLoop] Launching parallel research for ${plan.subClaims.length} sub-claims...`,
    onReasoningChunk,
    onUpdate
  );

  const result = await runParallelResearch(
    plan,
    apiConfig,
    braveApiKey,
    braveProxyUrl,
    wikiId,
    {
      onReasoningChunk: (chunk) => emitReasoning(chunk, onReasoningChunk, onUpdate),
      onTaskUpdate: (status) => {
        emitReasoning(
          `[ResearchLoop] ${status.subClaimQuestion}: ${status.state} (web=${status.webFindingsCount}, wiki=${status.wikiFindingsCount})`,
          onReasoningChunk,
          onUpdate
        );
      },
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Research loop failed');
  }

  const allFindings = [...result.externalFindings, ...result.internalFindings];

  return buildAgentOutput({
    draft: JSON.stringify({
      externalFindings: result.externalFindings,
      internalFindings: result.internalFindings,
    }),
    reasoning: `Researched ${plan.subClaims.length} sub-claims. ${result.externalFindings.length} web findings, ${result.internalFindings.length} wiki findings.`,
    metadata: {
      findings: allFindings,
      externalFindings: result.externalFindings,
      internalFindings: result.internalFindings,
      taskStatuses: result.taskStatuses,
    },
  });
}

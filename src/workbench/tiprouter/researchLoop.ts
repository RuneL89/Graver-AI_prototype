import type { ApiConfig } from '../types-shared';
import type { ResearchPlan, EvidenceFinding } from '../types';
import { researchSubClaimWeb, saveExternalEvidence } from './webResearcher';
import { researchSubClaimWiki, saveInternalEvidence } from './wikiQuerier';

export interface ResearchTaskStatus {
  subClaimId: string;
  subClaimQuestion: string;
  state: 'pending' | 'running' | 'completed' | 'failed';
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
 * For each sub-claim, launches WebResearcher and WikiQuerier simultaneously.
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

  function updateStatus(subClaimId: string, partial: Partial<ResearchTaskStatus>) {
    const idx = taskStatuses.findIndex((t) => t.subClaimId === subClaimId);
    if (idx !== -1) {
      taskStatuses[idx] = { ...taskStatuses[idx], ...partial };
      callbacks?.onTaskUpdate?.(taskStatuses[idx]);
    }
  }

  try {
    callbacks?.onReasoningChunk?.(`[ResearchLoop] Launching parallel research for ${plan.subClaims.length} sub-claims...`);

    const tasks = plan.subClaims.map(async (subClaim) => {
      updateStatus(subClaim.id, { state: 'running' });

      // Launch web and wiki research in parallel
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
      let error: string | undefined;

      if (webResult.status === 'fulfilled') {
        if (webResult.value.success) {
          webFindings = webResult.value.findings;
        } else {
          error = webResult.value.error;
        }
      } else {
        error = webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason);
      }

      if (wikiResult.status === 'fulfilled') {
        if (wikiResult.value.success) {
          wikiFindings = wikiResult.value.findings;
        } else if (!error) {
          error = wikiResult.value.error;
        }
      } else {
        if (!error) {
          error = wikiResult.reason instanceof Error ? wikiResult.reason.message : String(wikiResult.reason);
        }
      }

      externalFindings.push(...webFindings);
      internalFindings.push(...wikiFindings);

      updateStatus(subClaim.id, {
        state: error && webFindings.length === 0 && wikiFindings.length === 0 ? 'failed' : 'completed',
        webFindingsCount: webFindings.length,
        wikiFindingsCount: wikiFindings.length,
        error,
      });
    });

    await Promise.all(tasks);

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

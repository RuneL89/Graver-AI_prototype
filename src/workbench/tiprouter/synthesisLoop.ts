import type { ApiConfig } from '../types-shared';
import type { Synthesis, EvidenceAudit } from '../types';
import { synthesizeEvidence } from './synthesizer';
import { validateMechanically, buildMechanicalAudit } from './mechanicalValidator';
import { auditSynthesis } from './auditor';
import { rewriteSynthesis } from './evidenceWriter';

export interface SynthesisLoopCallbacks {
  onReasoningChunk?: (chunk: string) => void;
  onAuditIteration?: (iteration: number, audit: EvidenceAudit) => void;
}

export interface SynthesisLoopResult {
  success: boolean;
  synthesis?: Synthesis;
  finalAudit?: EvidenceAudit;
  iterations: number;
  error?: string;
}

const MAX_ITERATIONS = 5;

/**
 * Run the full synthesis → mechanical validation → qualitative audit → rewrite loop.
 */
export async function runSynthesisLoop(
  tipId: string,
  apiConfig: ApiConfig,
  callbacks?: SynthesisLoopCallbacks
): Promise<SynthesisLoopResult> {
  let iterations = 0;

  try {
    callbacks?.onReasoningChunk?.('[SynthesisLoop] Starting synthesis...');

    // Step 1: Generate initial synthesis
    const synthResult = await synthesizeEvidence(tipId, apiConfig, {
      onReasoningChunk: callbacks?.onReasoningChunk,
    });

    if (!synthResult.success || !synthResult.synthesis) {
      throw new Error(synthResult.error || 'Synthesis failed');
    }

    let synthesis = synthResult.synthesis;

    // Step 2: Audit loop
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      callbacks?.onReasoningChunk?.(`[SynthesisLoop] Audit iteration ${iterations}/${MAX_ITERATIONS}...`);

      // Mechanical validation
      const mechanical = validateMechanically(synthesis);
      if (!mechanical.passed) {
        const audit = buildMechanicalAudit(mechanical);
        callbacks?.onAuditIteration?.(iterations, audit);
        callbacks?.onReasoningChunk?.(`[SynthesisLoop] Mechanical check failed. Rewriting...`);

        const rewrite = await rewriteSynthesis(synthesis, audit, apiConfig, {
          onReasoningChunk: callbacks?.onReasoningChunk,
        });

        if (!rewrite.success || !rewrite.synthesis) {
          throw new Error(rewrite.error || 'Rewrite failed');
        }
        synthesis = rewrite.synthesis;
        continue;
      }

      callbacks?.onReasoningChunk?.('[SynthesisLoop] Mechanical check passed.');

      // Qualitative audit
      const auditResult = await auditSynthesis(synthesis, apiConfig, {
        onReasoningChunk: callbacks?.onReasoningChunk,
      });

      if (!auditResult.success || !auditResult.audit) {
        throw new Error(auditResult.error || 'Audit failed');
      }

      const audit = auditResult.audit;
      callbacks?.onAuditIteration?.(iterations, audit);

      if (audit.approval_status === 'APPROVED') {
        callbacks?.onReasoningChunk?.(`[SynthesisLoop] APPROVED after ${iterations} iteration(s).`);
        return {
          success: true,
          synthesis,
          finalAudit: audit,
          iterations,
        };
      }

      if (iterations >= MAX_ITERATIONS) {
        callbacks?.onReasoningChunk?.(`[SynthesisLoop] Max iterations reached. Returning best effort.`);
        return {
          success: true,
          synthesis,
          finalAudit: audit,
          iterations,
        };
      }

      callbacks?.onReasoningChunk?.('[SynthesisLoop] Rejected — rewriting...');
      const rewrite = await rewriteSynthesis(synthesis, audit, apiConfig, {
        onReasoningChunk: callbacks?.onReasoningChunk,
      });

      if (!rewrite.success || !rewrite.synthesis) {
        throw new Error(rewrite.error || 'Rewrite failed');
      }
      synthesis = rewrite.synthesis;
    }

    return {
      success: true,
      synthesis,
      iterations,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[SynthesisLoop] Error: ${error}`);
    return {
      success: false,
      iterations,
      error,
    };
  }
}

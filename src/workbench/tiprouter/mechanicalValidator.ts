import type { Synthesis, EvidenceAudit } from '../types';
import type { AgentOutput, StageRecord } from '../lib/pipelineTypes';
import type { WorkbenchAgentContext } from '../lib/workbenchAgentContext';
import { emitReasoning, buildAgentOutput } from '../lib/workbenchAgentContext';

export interface MechanicalValidationResult {
  passed: boolean;
  issues: string[];
}

/**
 * Fast code-level validation of a synthesis (zero LLM cost).
 * Checks:
 * - Every sub-claim has ≥1 supporting source
 * - Sources come from ≥2 distinct domains or documents
 * - All required fields are present
 */
export function validateMechanically(synthesis: Synthesis): MechanicalValidationResult {
  const issues: string[] = [];

  for (const entry of synthesis.entries) {
    // 1. Every claim has ≥1 source
    if (!entry.supportingSources || entry.supportingSources.length === 0) {
      issues.push(`Sub-claim ${entry.subClaimId} has no supporting sources.`);
    }

    // 2. Sources are from ≥2 distinct refs
    if (entry.supportingSources && entry.supportingSources.length > 0) {
      const distinctRefs = new Set(entry.supportingSources.map((s) => s.ref));
      if (distinctRefs.size < 2) {
        issues.push(`Sub-claim ${entry.subClaimId} relies on a single source (${Array.from(distinctRefs)[0]}).`);
      }
    }

    // 3. Required fields present
    if (!entry.subClaimId) {
      issues.push('Entry missing subClaimId.');
    }
    if (!entry.supportingSources) {
      issues.push(`Entry ${entry.subClaimId} missing supportingSources array.`);
    } else {
      for (const src of entry.supportingSources) {
        if (!src.ref) {
          issues.push(`Entry ${entry.subClaimId} has a supporting source missing ref.`);
        }
        if (!src.passage) {
          issues.push(`Entry ${entry.subClaimId} has a supporting source missing passage.`);
        }
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * Build an EvidenceAudit from mechanical validation results.
 */
export function buildMechanicalAudit(validation: MechanicalValidationResult): EvidenceAudit {
  return {
    approval_status: validation.passed ? 'APPROVED' : 'REJECTED',
    mechanical_pass: validation.passed,
    qualitative_pass: false,
    has_feedback: !validation.passed,
    rewriter_instructions: validation.passed
      ? undefined
      : `Mechanical validation failed:\n- ${validation.issues.join('\n- ')}\n\nPlease add missing sources or diversify references.`,
  };
}

/**
 * AgentFn implementation of mechanical validation.
 * Receives synthesis JSON via `ctx.currentDraft`.
 * Returns AgentOutput with validation result and audit in metadata.
 */
export async function validateMechanicallyAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  const synthesis: Synthesis = JSON.parse(ctx.currentDraft);

  emitReasoning('[MechanicalValidator] Running fast code-level validation...', onReasoningChunk, onUpdate);

  const validation = validateMechanically(synthesis);
  const audit = buildMechanicalAudit(validation);

  emitReasoning(
    `[MechanicalValidator] ${validation.passed ? 'PASSED' : 'FAILED'} — ${validation.issues.length} issue(s).`,
    onReasoningChunk,
    onUpdate
  );

  return buildAgentOutput({
    draft: JSON.stringify(validation),
    reasoning: `Mechanical validation ${validation.passed ? 'passed' : 'failed'} with ${validation.issues.length} issue(s)`,
    metadata: { validation, audit },
  });
}

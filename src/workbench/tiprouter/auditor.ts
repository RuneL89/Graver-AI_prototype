import type { ApiConfig } from '../types-shared';
import type { Synthesis, EvidenceAudit } from '../types';
import { callLLM } from '../lib/apiConfig';
import type { AgentOutput, StageRecord } from '../lib/pipelineTypes';
import type { WorkbenchAgentContext } from '../lib/workbenchAgentContext';
import { checkAborted, emitReasoning, buildAgentOutput } from '../lib/workbenchAgentContext';
import { validateMechanically, buildMechanicalAudit } from './mechanicalValidator';

export interface AuditCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface AuditResult {
  success: boolean;
  audit?: EvidenceAudit;
  error?: string;
}

/**
 * Qualitative LLM audit of a synthesis.
 * Evaluates logical consistency, evidentiary strength, and counter-narrative coverage.
 */
export async function auditSynthesis(
  synthesis: Synthesis,
  apiConfig: ApiConfig,
  callbacks?: AuditCallbacks,
  signal?: AbortSignal
): Promise<AuditResult> {
  try {
    callbacks?.onReasoningChunk?.('[Auditor] Starting qualitative audit...');

    const prompt =
      `You are an evidence auditor for investigative journalism. Review the following synthesis and evaluate its quality.\n\n` +
      `# Synthesis\n` +
      JSON.stringify(synthesis, null, 2).slice(0, 12000) +
      `\n\nEvaluate on these criteria:\n` +
      `1. Logical consistency — do the supporting sources actually support the claims?\n` +
      `2. Evidentiary strength — are high-confidence sources used where possible?\n` +
      `3. Counter-narrative coverage — are contradictions acknowledged and explained?\n` +
      `4. Gap severity — are the identified gaps reasonable and actionable?\n\n` +
      `Output format (JSON):\n` +
      `{\n` +
      `  "approval_status": "APPROVED" | "REJECTED",\n` +
      `  "mechanical_pass": true,\n` +
      `  "qualitative_pass": true | false,\n` +
      `  "has_feedback": true | false,\n` +
      `  "rewriter_instructions": "..."\n` +
      `}\n\n` +
      `Rules:\n` +
      `- APPROVED only if the synthesis is logically sound, well-supported, and gaps are minor\n` +
      `- REJECTED if there are logical flaws, unsupported claims, or major gaps\n` +
      `- rewriter_instructions must be specific and actionable (e.g., "Add a source that confirms X", "Resolve contradiction between source A and B by...")\n` +
      `- Output ONLY valid JSON`;

    const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
    if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

    let parsed: EvidenceAudit;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        throw new Error('Failed to parse audit JSON');
      }
    }

    callbacks?.onReasoningChunk?.(
      `[Auditor] Verdict: ${parsed.approval_status}${parsed.has_feedback ? ' — feedback provided' : ''}`
    );

    return { success: true, audit: parsed };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Auditor] Error: ${error}`);
    return { success: false, error };
  }
}

/**
 * AgentFn implementation of qualitative audit.
 * Receives synthesis JSON via `ctx.currentDraft`.
 */
export async function auditSynthesisAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  checkAborted(ctx);
  const synthesis: Synthesis = JSON.parse(ctx.currentDraft);
  const apiConfig = ctx.apiConfig;

  emitReasoning('[Auditor] Starting qualitative audit...', onReasoningChunk, onUpdate);

  const prompt =
    `You are an evidence auditor for investigative journalism. Review the following synthesis and evaluate its quality.\n\n` +
    `# Synthesis\n` +
    JSON.stringify(synthesis, null, 2).slice(0, 12000) +
    `\n\nEvaluate on these criteria:\n` +
    `1. Logical consistency — do the supporting sources actually support the claims?\n` +
    `2. Evidentiary strength — are high-confidence sources used where possible?\n` +
    `3. Counter-narrative coverage — are contradictions acknowledged and explained?\n` +
    `4. Gap severity — are the identified gaps reasonable and actionable?\n\n` +
    `Output format (JSON):\n` +
    `{\n` +
    `  "approval_status": "APPROVED" | "REJECTED",\n` +
    `  "mechanical_pass": true,\n` +
    `  "qualitative_pass": true | false,\n` +
    `  "has_feedback": true | false,\n` +
    `  "rewriter_instructions": "..."\n` +
    `}\n\n` +
    `Rules:\n` +
    `- APPROVED only if the synthesis is logically sound, well-supported, and gaps are minor\n` +
    `- REJECTED if there are logical flaws, unsupported claims, or major gaps\n` +
    `- rewriter_instructions must be specific and actionable (e.g., "Add a source that confirms X", "Resolve contradiction between source A and B by...")\n` +
    `- Output ONLY valid JSON`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, ctx.abortSignal);
  if (reasoning) emitReasoning(reasoning, onReasoningChunk, onUpdate);

  let parsed: EvidenceAudit;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    const match = content.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      parsed = JSON.parse(match[1].trim());
    } else {
      throw new Error('Failed to parse audit JSON');
    }
  }

  emitReasoning(
    `[Auditor] Verdict: ${parsed.approval_status}${parsed.has_feedback ? ' — feedback provided' : ''}`,
    onReasoningChunk,
    onUpdate
  );

  return buildAgentOutput({
    draft: JSON.stringify(parsed),
    reasoning: `Audit verdict: ${parsed.approval_status}`,
    metadata: { audit: parsed },
    prompt,
  });
}

/**
 * Composite audit agent that runs mechanical validation first,
 * then qualitative audit if mechanical passes.
 * Returns the audit result in metadata so getNextStage can route to rewrite or assemble.
 */
export async function auditAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  checkAborted(ctx);
  const synthesis: Synthesis = JSON.parse(ctx.currentDraft);

  // Step 1: Mechanical validation
  emitReasoning('[AuditAgent] Running mechanical validation...', onReasoningChunk, onUpdate);

  const mechanical = validateMechanically(synthesis);
  const mechanicalAudit = buildMechanicalAudit(mechanical);

  emitReasoning(
    `[AuditAgent] Mechanical check ${mechanical.passed ? 'PASSED' : 'FAILED'}.`,
    onReasoningChunk,
    onUpdate
  );

  if (!mechanical.passed) {
    return buildAgentOutput({
      draft: JSON.stringify(mechanicalAudit),
      reasoning: `Mechanical validation failed: ${mechanical.issues.join('; ')}`,
      metadata: { audit: mechanicalAudit, auditResult: mechanicalAudit, validation: mechanical },
    });
  }

  // Step 2: Qualitative audit
  emitReasoning('[AuditAgent] Mechanical check passed. Running qualitative audit...', onReasoningChunk, onUpdate);

  const qualitativeResult = await auditSynthesisAgent(ctx, onReasoningChunk, onUpdate);

  // Merge the mechanical pass flag into the qualitative audit
  const audit = qualitativeResult.metadata
    ? { ...(qualitativeResult.metadata as { audit: EvidenceAudit }).audit, mechanical_pass: true }
    : mechanicalAudit;

  return buildAgentOutput({
    draft: JSON.stringify(audit),
    reasoning: qualitativeResult.reasoning,
    metadata: { audit, auditResult: audit },
    prompt: qualitativeResult.prompt,
  });
}

import type { ApiConfig } from '../types-shared';
import type { Synthesis, EvidenceAudit } from '../types';
import { callLLM } from '../lib/apiConfig';

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
  callbacks?: AuditCallbacks
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

    const { content, reasoning } = await callLLM(apiConfig, prompt);
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

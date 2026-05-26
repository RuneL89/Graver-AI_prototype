import type { ApiConfig } from '../types-shared';
import type { Synthesis, EvidenceAudit } from '../types';
import { callLLM } from '../lib/apiConfig';
import { dbSet } from '../lib/fileManager';

export interface RewriteCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface RewriteResult {
  success: boolean;
  synthesis?: Synthesis;
  error?: string;
}

/**
 * Apply auditor feedback to patch a synthesis.
 */
export async function rewriteSynthesis(
  synthesis: Synthesis,
  audit: EvidenceAudit,
  apiConfig: ApiConfig,
  callbacks?: RewriteCallbacks
): Promise<RewriteResult> {
  try {
    callbacks?.onReasoningChunk?.('[EvidenceWriter] Rewriting synthesis based on audit feedback...');

    const prompt =
      `You are an evidence writer revising a synthesis based on audit feedback.\n\n` +
      `# Current Synthesis\n` +
      JSON.stringify(synthesis, null, 2).slice(0, 8000) +
      `\n\n# Audit Feedback\n` +
      `${audit.rewriter_instructions || 'Improve the synthesis.'}\n\n` +
      `Make minimal, targeted changes to address the feedback. Preserve all existing content that does not need changing.\n\n` +
      `Output the complete revised synthesis as JSON:\n` +
      `{\n` +
      `  "entries": [\n` +
      `    {\n` +
      `      "subClaimId": "...",\n` +
      `      "supportingSources": [...],\n` +
      `      "contradictions": [...],\n` +
      `      "gaps": [...]\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Output ONLY valid JSON.`;

    const { content, reasoning } = await callLLM(apiConfig, prompt);
    if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

    let parsed: { entries: Synthesis['entries'] };
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        throw new Error('Failed to parse rewritten synthesis JSON');
      }
    }

    const revised: Synthesis = {
      ...synthesis,
      entries: parsed.entries || synthesis.entries,
      createdAt: new Date().toISOString(),
    };

    await dbSet(`synthesis/${synthesis.tipId}`, JSON.stringify(revised, null, 2));

    callbacks?.onReasoningChunk?.('[EvidenceWriter] Revision complete.');

    return { success: true, synthesis: revised };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[EvidenceWriter] Error: ${error}`);
    return { success: false, error };
  }
}

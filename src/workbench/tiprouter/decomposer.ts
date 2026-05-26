import type { ApiConfig } from '../types-shared';
import type { Tip, SubClaim, ResearchPlan } from '../types';
import { callLLM } from '../lib/apiConfig';
import { dbSet } from '../lib/fileManager';

export interface DecomposeCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface DecomposeResult {
  success: boolean;
  plan?: ResearchPlan;
  error?: string;
}

function generateTipId(): string {
  return `tip-${Date.now()}`;
}

function generateSubClaimId(index: number): string {
  return `sc-${Date.now()}-${index}`;
}

/**
 * Decompose an investigative tip into 3–5 structured sub-claims.
 */
export async function decomposeTip(
  tipText: string,
  apiConfig: ApiConfig,
  callbacks?: DecomposeCallbacks
): Promise<DecomposeResult> {
  try {
    callbacks?.onReasoningChunk?.('[Decomposer] Starting decomposition...');

    const prompt =
      `You are an investigative research assistant. Your job is to break down a journalist's tip into 3–5 structured, verifiable sub-claims or research questions.\n\n` +
      `# Tip:\n${tipText}\n\n` +
      `For each sub-claim, provide:\n` +
      `- A concise research question (what needs to be verified)\n` +
      `- A one-sentence claim statement (what the tip alleges)\n\n` +
      `Output format (JSON):\n` +
      `{\n` +
      `  "subClaims": [\n` +
      `    {\n` +
      `      "question": "...",\n` +
      `      "claim": "..."\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Requirements:\n` +
      `- Produce exactly 3 to 5 sub-claims\n` +
      `- Each must be independently verifiable\n` +
      `- Cover different angles of the tip (people, organizations, events, financials, etc.)\n` +
      `- Output ONLY valid JSON, no markdown formatting`;

    const { content, reasoning } = await callLLM(apiConfig, prompt);
    if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

    let parsed: { subClaims: Array<{ question: string; claim: string }> };
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        throw new Error('Failed to parse decomposition JSON');
      }
    }

    const subClaims: SubClaim[] = (parsed.subClaims || []).slice(0, 5).map((sc, i) => ({
      id: generateSubClaimId(i),
      question: sc.question,
      claim: sc.claim,
    }));

    if (subClaims.length < 3) {
      throw new Error(`Decomposition produced only ${subClaims.length} sub-claims; minimum is 3`);
    }

    const tip: Tip = {
      id: generateTipId(),
      text: tipText,
      createdAt: new Date().toISOString(),
    };

    const plan: ResearchPlan = {
      tipId: tip.id,
      subClaims,
      createdAt: new Date().toISOString(),
    };

    await dbSet(`research-plan/${tip.id}`, JSON.stringify(plan, null, 2));

    callbacks?.onReasoningChunk?.(`[Decomposer] Generated ${subClaims.length} sub-claims.`);

    return { success: true, plan };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Decomposer] Error: ${error}`);
    return { success: false, error };
  }
}

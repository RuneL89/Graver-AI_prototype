import type { ApiConfig } from '../types-shared';
import type { ResearchPlan, EvidenceFinding, Synthesis, SynthesisEntry } from '../types';
import { callLLM } from '../lib/apiConfig';
import { dbGet, dbSet } from '../lib/fileManager';
import type { AgentOutput, StageRecord } from '../lib/pipelineTypes';
import type { WorkbenchAgentContext } from '../lib/workbenchAgentContext';
import { checkAborted, emitReasoning, buildAgentOutput } from '../lib/workbenchAgentContext';

export interface SynthesizeCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface SynthesizeResult {
  success: boolean;
  synthesis?: Synthesis;
  error?: string;
}

async function loadResearchPlan(tipId: string): Promise<ResearchPlan | null> {
  const raw = await dbGet(`research-plan/${tipId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw as string) as ResearchPlan;
  } catch {
    return null;
  }
}

async function loadEvidence(tipId: string): Promise<{ external: EvidenceFinding[]; internal: EvidenceFinding[] }> {
  const extRaw = await dbGet(`external-evidence/${tipId}`);
  const intRaw = await dbGet(`internal-evidence/${tipId}`);
  const external = extRaw ? (JSON.parse(extRaw as string).findings as EvidenceFinding[]) || [] : [];
  const internal = intRaw ? (JSON.parse(intRaw as string).findings as EvidenceFinding[]) || [] : [];
  return { external, internal };
}

/**
 * Synthesize external and internal evidence into a structured analysis.
 */
export async function synthesizeEvidence(
  tipId: string,
  apiConfig: ApiConfig,
  callbacks?: SynthesizeCallbacks,
  signal?: AbortSignal
): Promise<SynthesizeResult> {
  try {
    callbacks?.onReasoningChunk?.('[Synthesizer] Loading evidence...');

    const plan = await loadResearchPlan(tipId);
    if (!plan) {
      throw new Error('Research plan not found');
    }

    const { external, internal } = await loadEvidence(tipId);
    const allFindings = [...external, ...internal];

    callbacks?.onReasoningChunk?.(
      `[Synthesizer] Loaded ${external.length} web findings, ${internal.length} wiki findings.`
    );

    const prompt =
      `You are a cross-reference synthesizer for investigative journalism.\n\n` +
      `# Research Plan\n` +
      plan.subClaims.map((sc) => `- ${sc.id}: ${sc.question}\n  Claim: ${sc.claim}`).join('\n') +
      `\n\n# Evidence Findings\n` +
      allFindings
        .map(
          (f, i) =>
            `## Finding ${i + 1}\n` +
            `- Sub-claim: ${f.subClaimId}\n` +
            `- Source: ${f.sourceType === 'web' ? f.sourceUrl : f.documentRef}\n` +
            `- Passage: ${f.passage.slice(0, 500)}\n` +
            `- Summary: ${f.summary}\n` +
            `- Confidence: ${f.confidence}\n`
        )
        .join('\n') +
      `\n\nFor each sub-claim, produce a synthesis entry with:\n` +
      `- supportingSources: array of {sourceType, ref, citationAnchor?, passage} for sources that support the claim\n` +
      `- contradictions: array of {between: [sourceA, sourceB], description} for conflicting evidence\n` +
      `- gaps: array of strings describing missing evidence or unanswered questions\n\n` +
      `Output format (JSON):\n` +
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
      `Requirements:\n` +
      `- Every sub-claim in the research plan must have an entry\n` +
      `- Be specific about which sources contradict each other\n` +
      `- Gaps should be actionable (e.g., "Need financial records for 2023")\n` +
      `- Output ONLY valid JSON`;

    const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
    if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

    let parsed: { entries: SynthesisEntry[] };
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        throw new Error('Failed to parse synthesis JSON');
      }
    }

    const synthesis: Synthesis = {
      tipId,
      entries: parsed.entries || [],
      createdAt: new Date().toISOString(),
    };

    await dbSet(`synthesis/${tipId}`, JSON.stringify(synthesis, null, 2));

    callbacks?.onReasoningChunk?.(
      `[Synthesizer] Complete. ${synthesis.entries.length} entries, ` +
      `${synthesis.entries.reduce((n, e) => n + e.contradictions.length, 0)} contradictions, ` +
      `${synthesis.entries.reduce((n, e) => n + e.gaps.length, 0)} gaps.`
    );

    return { success: true, synthesis };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Synthesizer] Error: ${error}`);
    return { success: false, error };
  }
}

/**
 * AgentFn implementation of synthesizer.
 * Receives tipId via `ctx.currentDraft`.
 */
export async function synthesizeEvidenceAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  checkAborted(ctx);
  const tipId = ctx.currentDraft;
  const apiConfig = ctx.apiConfig;

  emitReasoning('[Synthesizer] Loading evidence...', onReasoningChunk, onUpdate);

  const plan = await loadResearchPlan(tipId);
  if (!plan) {
    throw new Error('Research plan not found');
  }

  const { external, internal } = await loadEvidence(tipId);
  const allFindings = [...external, ...internal];

  emitReasoning(
    `[Synthesizer] Loaded ${external.length} web findings, ${internal.length} wiki findings.`,
    onReasoningChunk,
    onUpdate
  );

  const prompt =
    `You are a cross-reference synthesizer for investigative journalism.\n\n` +
    `# Research Plan\n` +
    plan.subClaims.map((sc) => `- ${sc.id}: ${sc.question}\n  Claim: ${sc.claim}`).join('\n') +
    `\n\n# Evidence Findings\n` +
    allFindings
      .map(
        (f, i) =>
          `## Finding ${i + 1}\n` +
          `- Sub-claim: ${f.subClaimId}\n` +
          `- Source: ${f.sourceType === 'web' ? f.sourceUrl : f.documentRef}\n` +
          `- Passage: ${f.passage.slice(0, 500)}\n` +
          `- Summary: ${f.summary}\n` +
          `- Confidence: ${f.confidence}\n`
      )
      .join('\n') +
    `\n\nFor each sub-claim, produce a synthesis entry with:\n` +
    `- supportingSources: array of {sourceType, ref, citationAnchor?, passage} for sources that support the claim\n` +
    `- contradictions: array of {between: [sourceA, sourceB], description} for conflicting evidence\n` +
    `- gaps: array of strings describing missing evidence or unanswered questions\n\n` +
    `Output format (JSON):\n` +
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
    `Requirements:\n` +
    `- Every sub-claim in the research plan must have an entry\n` +
    `- Be specific about which sources contradict each other\n` +
    `- Gaps should be actionable (e.g., "Need financial records for 2023")\n` +
    `- Output ONLY valid JSON`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, ctx.abortSignal);
  if (reasoning) emitReasoning(reasoning, onReasoningChunk, onUpdate);

  let parsed: { entries: SynthesisEntry[] };
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    const match = content.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      parsed = JSON.parse(match[1].trim());
    } else {
      throw new Error('Failed to parse synthesis JSON');
    }
  }

  const synthesis: Synthesis = {
    tipId,
    entries: parsed.entries || [],
    createdAt: new Date().toISOString(),
  };

  await dbSet(`synthesis/${tipId}`, JSON.stringify(synthesis, null, 2));

  emitReasoning(
    `[Synthesizer] Complete. ${synthesis.entries.length} entries, ` +
    `${synthesis.entries.reduce((n, e) => n + e.contradictions.length, 0)} contradictions, ` +
    `${synthesis.entries.reduce((n, e) => n + e.gaps.length, 0)} gaps.`,
    onReasoningChunk,
    onUpdate
  );

  return buildAgentOutput({
    draft: JSON.stringify(synthesis),
    reasoning: `Synthesized ${synthesis.entries.length} entries with contradictions and gaps`,
    metadata: { synthesis },
    prompt,
  });
}
